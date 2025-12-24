import { NextRequest, NextResponse } from "next/server"
import { getRepositoryIndex } from "@/lib/repository/storage-filesystem"
import { searchFiles } from "@/lib/repository/search"
import { IndexedFile } from "@/lib/types/repository"
import { getSystemPrompt, DEFAULT_ROLE, type AssistantRole } from "@/lib/prompts/system-prompts"

/**
 * Limpia la respuesta del asistente eliminando razonamiento interno, intenciones detectadas y metadata de debug
 */
function cleanAnswerFromInternalReasoning(answer: string): string {
  let cleaned = answer
  
  // Eliminar bloques de razonamiento interno comunes
  const reasoningPatterns = [
    /Intención\s+(?:de\s+la\s+)?pregunta[^\n]*:?\s*\n?[^\n]*\n?/gi,
    /Intención\s+detectada[^\n]*:?\s*\n?[^\n]*\n?/gi,
    /Resumen\s+basado\s+en[^\n]*:?\s*\n?[^\n]*\n?/gi,
    /Análisis\s+de\s+la\s+pregunta[^\n]*:?\s*\n?[^\n]*\n?/gi,
    /Detectando\s+intención[^\n]*:?\s*\n?[^\n]*\n?/gi,
    /Basándome\s+en\s+el\s+contexto[^\n]*:?\s*\n?[^\n]*\n?/gi,
    /Parece\s+que\s+la\s+pregunta[^\n]*:?\s*\n?[^\n]*\n?/gi,
    /La\s+pregunta\s+parece\s+referirse\s+a[^\n]*:?\s*\n?[^\n]*\n?/gi,
  ]
  
  reasoningPatterns.forEach(pattern => {
    cleaned = cleaned.replace(pattern, '')
  })
  
  // Eliminar líneas que contengan lenguaje especulativo al inicio
  const lines = cleaned.split('\n')
  const filteredLines = lines.filter(line => {
    const trimmed = line.trim()
    // Eliminar líneas que empiezan con lenguaje especulativo
    if (/^(Parece|Probablemente|Posiblemente|Tal vez|Quizás|Es probable que|Es posible que)/i.test(trimmed)) {
      return false
    }
    return true
  })
  
  cleaned = filteredLines.join('\n').trim()
  
  return cleaned
}

/**
 * Valida que una fuente exista en el índice real del repositorio
 */
function validateSourceExists(sourcePath: string, indexFiles: IndexedFile[]): boolean {
  const normalizedPath = sourcePath.trim().replace(/\\/g, '/')
  const fileName = normalizedPath.split('/').pop() || normalizedPath
  
  // Buscar coincidencia exacta o parcial
  return indexFiles.some((file: IndexedFile) => {
    return file.path === normalizedPath ||
           file.path.endsWith(normalizedPath) ||
           file.path.includes(normalizedPath) ||
           file.name === fileName
  })
}

/**
 * Fuerza el formato de salida estándar en la respuesta
 */
function enforceOutputFormat(answer: string): string {
  // Verificar si ya tiene el formato correcto
  const hasSources = /Fuentes\s*\([^)]*\)\s*:?\s*\n?/i.test(answer)
  const hasRespuesta = /Respuesta\s*:?\s*\n?/i.test(answer)
  
  // Si ya tiene el formato básico, solo limpiar
  if (hasSources && hasRespuesta) {
    return answer
  }
  
  // Si no tiene formato, intentar estructurarlo
  // Primero buscar si hay contenido útil
  const trimmed = answer.trim()
  if (!trimmed) {
    return "Fuentes:\nRespuesta:\nMejoras / Riesgos:\nFalta contexto:"
  }
  
  // Intentar extraer contenido y estructurarlo
  const parts: string[] = []
  
  // Buscar fuentes mencionadas
  const sourcesMatch = answer.match(/Fuentes?\s*[:\-]?\s*\n?([\s\S]*?)(?=\n(?:Respuesta|Mejoras|Falta|$))/i)
  if (sourcesMatch) {
    parts.push(`Fuentes:\n${sourcesMatch[1].trim()}`)
  } else {
    parts.push("Fuentes:")
  }
  
  // Buscar respuesta
  const respuestaMatch = answer.match(/Respuesta\s*[:\-]?\s*\n?([\s\S]*?)(?=\n(?:⚠️|Mejoras|Falta|Preguntas|$))/i)
  if (respuestaMatch) {
    parts.push(`Respuesta:\n${respuestaMatch[1].trim()}`)
  } else {
    // Si no hay sección de respuesta explícita, usar todo el contenido como respuesta
    const contentWithoutSources = answer.replace(/Fuentes?\s*[:\-]?\s*\n?[\s\S]*?(?=\n(?:Respuesta|⚠️|Mejoras|Falta|Preguntas|$))/i, '').trim()
    if (contentWithoutSources) {
      parts.push(`Respuesta:\n${contentWithoutSources}`)
    } else {
      parts.push("Respuesta:")
    }
  }
  
  // Buscar sección "No confirmado en el repositorio"
  const noConfirmadoMatch = answer.match(/⚠️\s*No\s+confirmado\s+en\s+el\s+repositorio\s*[:\-]?\s*\n?([\s\S]*?)(?=\n(?:Mejoras|Falta|Preguntas|$))/i)
  if (noConfirmadoMatch) {
    parts.push(`⚠️ No confirmado en el repositorio:\n${noConfirmadoMatch[1].trim()}`)
  }
  
  // Buscar mejoras/riesgos
  const mejorasMatch = answer.match(/Mejoras\s*\/\s*Riesgos?\s*[:\-]?\s*\n?([\s\S]*?)(?=\n(?:Falta|Preguntas|$))/i)
  if (mejorasMatch) {
    parts.push(`Mejoras / Riesgos:\n${mejorasMatch[1].trim()}`)
  } else {
    parts.push("Mejoras / Riesgos:")
  }
  
  // Buscar falta contexto
  const faltaMatch = answer.match(/Falta\s+contexto\s*[:\-]?\s*\n?([\s\S]*?)(?=\n(?:Preguntas|$))/i)
  if (faltaMatch) {
    parts.push(`Falta contexto:\n${faltaMatch[1].trim()}`)
  } else {
    parts.push("Falta contexto:")
  }
  
  // Buscar preguntas de seguimiento
  const preguntasMatch = answer.match(/Preguntas\s+de\s+seguimiento\s*[:\-]?\s*\n?([\s\S]*?)$/i)
  if (preguntasMatch) {
    parts.push(`Preguntas de seguimiento:\n${preguntasMatch[1].trim()}`)
  }
  
  return parts.join('\n\n')
}

/**
 * Extrae las fuentes (archivos/rutas) declaradas explícitamente en la respuesta del asistente
 * Busca el bloque "Fuentes (archivos/rutas):" y parsea las rutas mencionadas
 */
function extractSourcesFromAnswer(answer: string): string[] {
  // Buscar el bloque "Fuentes (archivos/rutas):" o variantes
  const sourcesPattern = /Fuentes\s*\([^)]*\)\s*:?\s*\n?/i
  const match = answer.match(sourcesPattern)
  
  if (!match) {
    return []
  }

  // Encontrar el índice donde comienza el bloque de fuentes
  const sourcesStartIndex = match.index! + match[0].length
  const restOfAnswer = answer.substring(sourcesStartIndex)
  
  // Buscar dónde termina el bloque de fuentes (siguiente sección o fin de texto)
  const nextSectionPattern = /(?:Respuesta|Mejoras|Riesgos|Falta contexto|Ubicación|$)/i
  const nextSectionMatch = restOfAnswer.match(nextSectionPattern)
  const sourcesEndIndex = nextSectionMatch ? nextSectionMatch.index! : restOfAnswer.length
  
  // Extraer el bloque de fuentes
  const sourcesBlock = restOfAnswer.substring(0, sourcesEndIndex).trim()
  
  if (!sourcesBlock) {
    return []
  }

  // Parsear rutas/archivos del bloque
  // Buscar rutas que parezcan archivos (contienen / o terminan en extensiones comunes)
  const pathPattern = /([a-zA-Z0-9_\-./]+\.(ts|tsx|js|jsx|md|json|mjs|css|scss|py|java|go|rs|rb|php|yml|yaml)|[a-zA-Z0-9_\-./]+\/[a-zA-Z0-9_\-./]+)/g
  const paths: string[] = []
  let pathMatch
  
  while ((pathMatch = pathPattern.exec(sourcesBlock)) !== null) {
    const path = pathMatch[1].trim()
    // Filtrar rutas que parezcan válidas (no solo palabras sueltas)
    if (path.includes('/') || path.match(/\.(ts|tsx|js|jsx|md|json|mjs|css|scss|py|java|go|rs|rb|php|yml|yaml)$/)) {
      paths.push(path)
    }
  }

  // También buscar rutas mencionadas en formato de lista (líneas que empiezan con - o *)
  const listPattern = /^[\s\-*]+([^\n]+)$/gm
  let listMatch
  while ((listMatch = listPattern.exec(sourcesBlock)) !== null) {
    const item = listMatch[1].trim()
    // Si el item parece una ruta, agregarlo
    if (item.includes('/') || item.match(/\.(ts|tsx|js|jsx|md|json|mjs|css|scss|py|java|go|rs|rb|php|yml|yaml)$/)) {
      // Limpiar el item (remover descripciones adicionales después de comas o espacios múltiples)
      const cleanPath = item.split(/[,;]\s*/)[0].trim().split(/\s+/)[0].trim()
      if (cleanPath && !paths.includes(cleanPath)) {
        paths.push(cleanPath)
      }
    }
  }

  // Buscar rutas mencionadas en formato natural dentro del bloque (ej: "docs/architecture.md", "app/api/chat/route.ts")
  const naturalPathPattern = /\b([a-zA-Z0-9_\-./]+(?:\.(?:ts|tsx|js|jsx|md|json|mjs|css|scss|py|java|go|rs|rb|php|yml|yaml))?)\b/g
  let naturalMatch
  while ((naturalMatch = naturalPathPattern.exec(sourcesBlock)) !== null) {
    const potentialPath = naturalMatch[1].trim()
    // Solo agregar si parece una ruta válida (contiene / o tiene extensión)
    if ((potentialPath.includes('/') || potentialPath.match(/\.(ts|tsx|js|jsx|md|json|mjs|css|scss|py|java|go|rs|rb|php|yml|yaml)$/)) 
        && potentialPath.length > 3 // Filtrar palabras muy cortas
        && !paths.includes(potentialPath)) {
      paths.push(potentialPath)
    }
  }

  return [...new Set(paths)] // Eliminar duplicados
}

/**
 * Extrae hallazgos clave (mejoras y riesgos) mencionados en la respuesta del asistente
 */
function extractFindingsFromAnswer(answer: string): { improvements: string[]; risks: string[] } {
  const improvements: string[] = []
  const risks: string[] = []
  
  // Buscar bloque "Mejoras / Riesgos"
  const findingsPattern = /Mejoras\s*\/\s*Riesgos\s*\([^)]*\)\s*:?\s*\n?/i
  const match = answer.match(findingsPattern)
  
  if (match) {
    const findingsStartIndex = match.index! + match[0].length
    const restOfAnswer = answer.substring(findingsStartIndex)
    
    // Buscar dónde termina el bloque (siguiente sección)
    const nextSectionPattern = /(?:Falta contexto|Respuesta|$)/i
    const nextSectionMatch = restOfAnswer.match(nextSectionPattern)
    const findingsEndIndex = nextSectionMatch ? nextSectionMatch.index! : restOfAnswer.length
    
    const findingsBlock = restOfAnswer.substring(0, findingsEndIndex).trim()
    
    // Buscar mejoras y riesgos mencionados
    const improvementKeywords = /(?:mejorar|mejora|sugerir|recomendar|optimizar|refactorizar|extraer|separar)/i
    const riskKeywords = /(?:riesgo|problema|acoplamiento|deuda técnica|mantenibilidad|escalabilidad|fragilidad)/i
    
    // Dividir por líneas y categorizar
    const lines = findingsBlock.split('\n').map(l => l.trim()).filter(l => l.length > 0)
    lines.forEach(line => {
      if (improvementKeywords.test(line)) {
        improvements.push(line.substring(0, 100)) // Limitar longitud
      }
      if (riskKeywords.test(line)) {
        risks.push(line.substring(0, 100)) // Limitar longitud
      }
    })
  }
  
  return { improvements, risks }
}

/**
 * POST /api/chat
 * Genera una respuesta usando Ollama (phi-3) basada en archivos relevantes del repositorio
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { question, repositoryId, role, conversationMemory } = body
    
    // Determinar el rol del asistente (por defecto: architecture-explainer)
    const assistantRole: AssistantRole = role && (role === "architecture-explainer" || role === "structure-auditor")
      ? role
      : DEFAULT_ROLE

    // Validar inputs
    if (!question || typeof question !== "string" || !question.trim()) {
      return NextResponse.json(
        { error: "question es requerida y no puede estar vacía" },
        { status: 400 }
      )
    }

    if (!repositoryId || typeof repositoryId !== "string") {
      return NextResponse.json(
        { error: "repositoryId es requerido" },
        { status: 400 }
      )
    }

    // Obtener índice del repositorio
    const index = await getRepositoryIndex(repositoryId)

    if (!index) {
      return NextResponse.json(
        {
          error: `El repositorio ${repositoryId} no está indexado. Por favor, indexa el repositorio primero.`,
        },
        { status: 409 }
      )
    }

    if (index.status !== "completed") {
      return NextResponse.json(
        {
          error: `El repositorio ${repositoryId} está siendo indexado (status: ${index.status}). Por favor, espera a que termine la indexación.`,
        },
        { status: 409 }
      )
    }

    // Buscar archivos relevantes usando searchFiles
    const query = question.trim()
    const relevantFiles = searchFiles(index.files, query)

    // Construir contexto de texto con metadata de los archivos
    const contextParts: string[] = []

    if (relevantFiles.length === 0) {
      // Si no hay archivos relevantes, rechazar explícitamente sin inferencias
      return NextResponse.json({
        answer: "Fuentes:\n\nRespuesta:\nNo hay evidencia en el repositorio para responder esta pregunta.\n\nMejoras / Riesgos:\n\nFalta contexto:",
        files: [],
        sourcesDeclared: false,
        findings: {
          improvements: [],
          risks: [],
        },
        debug: {
          model: "phi3:mini",
          contextFiles: 0,
        },
      })
    }

    // Construir contexto con metadata de cada archivo relevante
    relevantFiles.forEach((file: IndexedFile, index: number) => {
      const fileContext: string[] = []
      
      fileContext.push(`Archivo ${index + 1}: ${file.name}`)
      fileContext.push(`Ruta: ${file.path}`)
      
      if (file.summary.description) {
        fileContext.push(`Descripción: ${file.summary.description}`)
      }
      
      if (file.summary.exports && file.summary.exports.length > 0) {
        fileContext.push(`Exports: ${file.summary.exports.join(", ")}`)
      }
      
      if (file.summary.functions && file.summary.functions.length > 0) {
        fileContext.push(`Funciones: ${file.summary.functions.join(", ")}`)
      }
      
      if (file.summary.hooks && file.summary.hooks.length > 0) {
        fileContext.push(`Hooks: ${file.summary.hooks.join(", ")}`)
      }
      
      if (file.summary.props && file.summary.props.length > 0) {
        fileContext.push(`Props: ${file.summary.props.join(", ")}`)
      }
      
      if (file.tags && file.tags.length > 0) {
        fileContext.push(`Tags: ${file.tags.join(", ")}`)
      }
      
      if (file.category) {
        fileContext.push(`Categoría: ${file.category}`)
      }
      
      contextParts.push(fileContext.join("\n"))
    })

    const contextText = contextParts.join("\n\n---\n\n")

    // Construir prompt usando el sistema de roles con memoria de conversación
    const prompt = getSystemPrompt(assistantRole, contextText, query, conversationMemory || null)

    // Llamar a Ollama local
    let ollamaResponse
    try {
      const ollamaRequest = await fetch("http://localhost:11434/api/generate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "phi3:mini",
          prompt: prompt,
          stream: false,
        }),
      })

      if (!ollamaRequest.ok) {
        throw new Error(`Error de Ollama: ${ollamaRequest.statusText}`)
      }

      ollamaResponse = await ollamaRequest.json()
    } catch (error) {
      // Si Ollama no está disponible, devolver respuesta de fallback
      console.error("Error al llamar a Ollama:", error)
      return NextResponse.json(
        {
          error: "Ollama no está disponible. Asegúrate de que Ollama esté ejecutándose en http://localhost:11434 y que el modelo 'phi3' esté instalado.",
          details: error instanceof Error ? error.message : "Error desconocido",
        },
        { status: 503 }
      )
    }

    // Extraer respuesta del modelo
    const rawAnswer = ollamaResponse.response || ollamaResponse.text || "No se pudo generar una respuesta."
    
    // Limpiar razonamiento interno y metadata de debug
    const cleanedAnswer = cleanAnswerFromInternalReasoning(rawAnswer)
    
    // Extraer fuentes explícitas declaradas en la respuesta ANTES de validar
    const declaredSources = extractSourcesFromAnswer(cleanedAnswer)
    
    // Validar que todas las fuentes mencionadas existan en el índice real
    const validSources = declaredSources.filter(sourcePath => 
      validateSourceExists(sourcePath, index.files)
    )
    
    // Si hay fuentes inválidas, loguearlas pero no incluirlas
    const invalidSources = declaredSources.filter(sourcePath => 
      !validateSourceExists(sourcePath, index.files)
    )
    if (invalidSources.length > 0) {
      console.warn(`Fuentes inválidas descartadas: ${invalidSources.join(', ')}`)
    }
    
    // Si no hay fuentes válidas pero hay archivos relevantes, usar los archivos relevantes como fuentes
    const finalSources = validSources.length > 0 
      ? validSources 
      : relevantFiles.map((file: IndexedFile) => file.path)
    
    // Limpiar la respuesta removiendo referencias a fuentes inválidas
    let finalAnswer = cleanedAnswer
    invalidSources.forEach(invalidSource => {
      // Remover referencias a fuentes inválidas de la respuesta
      const escapedSource = invalidSource.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      const sourcePattern = new RegExp(`\\b${escapedSource}\\b`, 'gi')
      finalAnswer = finalAnswer.replace(sourcePattern, '')
    })
    
    // Forzar formato de salida estándar
    const formattedAnswer = enforceOutputFormat(finalAnswer.trim())
    
    // Extraer hallazgos clave (mejoras y riesgos) de la respuesta formateada
    const findings = extractFindingsFromAnswer(formattedAnswer)

    // Mapear SOLO las fuentes válidas a archivos del índice
    const declaredFiles: Array<{ path: string; name: string }> = []
    const processedPaths = new Set<string>() // Evitar duplicados
    
    // Usar solo fuentes válidas (que existen en el índice)
    finalSources.forEach((sourcePath) => {
      if (processedPaths.has(sourcePath)) {
        return // Ya procesado
      }
      
      // Normalizar la ruta (remover espacios, normalizar separadores)
      const normalizedPath = sourcePath.trim().replace(/\\/g, '/')
      const fileName = normalizedPath.split('/').pop() || normalizedPath
      
      // Buscar archivo en el índice con orden de prioridad:
      // 1. Coincidencia exacta
      // 2. Termina con la ruta
      // 3. Contiene la ruta
      // 4. Nombre de archivo coincide
      let matchingFile: IndexedFile | undefined = undefined
      
      matchingFile = index.files.find((file: IndexedFile) => file.path === normalizedPath)
      if (!matchingFile) {
        matchingFile = index.files.find((file: IndexedFile) => file.path.endsWith(normalizedPath))
      }
      if (!matchingFile) {
        matchingFile = index.files.find((file: IndexedFile) => file.path.includes(normalizedPath))
      }
      if (!matchingFile) {
        matchingFile = index.files.find((file: IndexedFile) => file.name === fileName)
      }
      
      if (matchingFile) {
        // Evitar duplicados por path completo
        if (!processedPaths.has(matchingFile.path)) {
          declaredFiles.push({
            path: matchingFile.path,
            name: matchingFile.name,
          })
          processedPaths.add(matchingFile.path)
          processedPaths.add(sourcePath)
        }
      }
      // NO agregar fuentes que no existen en el índice - descartarlas silenciosamente
    })

    return NextResponse.json({
      answer: formattedAnswer,
      files: declaredFiles.length > 0 ? declaredFiles : [],
      sourcesDeclared: validSources.length > 0,
      findings: {
        improvements: findings.improvements,
        risks: findings.risks,
      },
      debug: {
        model: "phi3:mini",
        contextFiles: relevantFiles.length,
        declaredSources: validSources.length,
        invalidSourcesDiscarded: invalidSources.length,
        role: assistantRole,
      },
    })
  } catch (error) {
    console.error("Error en POST /api/chat:", error)
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Error desconocido",
      },
      { status: 500 }
    )
  }
}


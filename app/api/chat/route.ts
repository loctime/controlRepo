import { NextRequest, NextResponse } from "next/server"
import { getRepositoryIndex } from "@/lib/repository/storage-filesystem"
import { searchFiles } from "@/lib/repository/search"
import { IndexedFile } from "@/lib/types/repository"
import { getSystemPrompt, DEFAULT_ROLE, type AssistantRole } from "@/lib/prompts/system-prompts"

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
    // TODO: Hacer configurable desde UI en el futuro
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
      // Si no hay archivos relevantes, responder directamente sin llamar a Ollama
      return NextResponse.json({
        answer: "No se encontró información relevante en el repositorio para responder tu pregunta. Intenta reformular tu consulta o verifica que el repositorio esté correctamente indexado.",
        files: [],
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
    const answer = ollamaResponse.response || ollamaResponse.text || "No se pudo generar una respuesta."
    const trimmedAnswer = answer.trim()

    // Extraer fuentes explícitas declaradas en la respuesta
    const declaredSources = extractSourcesFromAnswer(trimmedAnswer)
    
    // Extraer hallazgos clave (mejoras y riesgos) de la respuesta
    const findings = extractFindingsFromAnswer(trimmedAnswer)

    // Mapear las fuentes declaradas a archivos del índice (si existen)
    const declaredFiles: Array<{ path: string; name: string }> = []
    const processedPaths = new Set<string>() // Evitar duplicados
    
    if (declaredSources.length > 0) {
      // Buscar coincidencias exactas o parciales en el índice
      declaredSources.forEach((sourcePath) => {
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
        } else {
          // Si no se encuentra en el índice, agregar la ruta tal como fue declarada
          // Esto permite mostrar fuentes que el asistente menciona aunque no estén indexadas
          declaredFiles.push({
            path: normalizedPath,
            name: fileName,
          })
          processedPaths.add(sourcePath)
        }
      })
    }

    return NextResponse.json({
      answer: trimmedAnswer,
      files: declaredFiles.length > 0 ? declaredFiles : [],
      sourcesDeclared: declaredSources.length > 0,
      findings: {
        improvements: findings.improvements,
        risks: findings.risks,
      },
      debug: {
        model: "phi3:mini",
        contextFiles: relevantFiles.length,
        declaredSources: declaredSources.length,
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


import { NextRequest, NextResponse } from "next/server"
import { searchFiles } from "@/lib/repository/search"
import { IndexedFile } from "@/lib/types/repository"
import { getSystemPrompt, DEFAULT_ROLE, type AssistantRole } from "@/lib/prompts/system-prompts"
import type { InternalLLMQueryRequest, InternalLLMQueryResponse } from "@/lib/types/internal-llm-query"
import { RepositoryMetrics } from "@/lib/types/repository-metrics"

/**
 * Detecta si una pregunta es de intención social (saludos, confirmaciones, etc.)
 */
function isSocialIntent(question: string): boolean {
  const socialPatterns = [
    /^(hola|hi|buenos\s+d[ií]as|buenas\s+tardes|buenas\s+noches)/i,
    /^(ok|okay|dale|entendido|perfecto|gracias|thanks|seguimos|continuamos)/i,
    /^(s[ií]|no|claro|exacto|correcto|bien|genial)$/i,
    /^(chau|adi[óo]s|hasta\s+luego|nos\s+vemos)/i,
    /^(c[óo]mo\s+est[áa]s|todo\s+bien)/i,
  ]
  
  const trimmed = question.trim().toLowerCase()
  
  // Si coincide con patrones sociales
  if (socialPatterns.some(pattern => pattern.test(trimmed))) {
    return true
  }
  
  // Si es corto (menos de 20 caracteres) y no tiene signo de interrogación, tratarlo como social
  if (trimmed.length < 20 && !trimmed.includes('?')) {
    return true
  }
  
  return false
}

/**
 * Detecta si una respuesta es social (no tiene formato técnico)
 */
function isSocialResponse(answer: string): boolean {
  // Si no tiene bloques técnicos y es corta, probablemente es social
  const hasTechnicalFormat = /Fuentes\s*:?\s*\n?/i.test(answer) || 
                             /Respuesta\s*:?\s*\n?/i.test(answer) ||
                             /Mejoras\s*\/\s*Riesgos/i.test(answer)
  
  // Si es muy corta (menos de 100 caracteres) y no tiene formato técnico, es social
  if (!hasTechnicalFormat && answer.trim().length < 100) {
    return true
  }
  
  return false
}

/**
 * Limpia la respuesta del asistente eliminando razonamiento interno, intenciones detectadas y metadata de debug
 */
function cleanAnswerFromInternalReasoning(answer: string): string {
  let cleaned = answer
  
  // Detectar si hay sección "No confirmado" - en ese caso, preservar contenido dentro de ella
  const noConfirmadoIndex = cleaned.search(/⚠️\s*No\s+confirmado\s+en\s+el\s+repositorio/i)
  const hasNoConfirmadoSection = noConfirmadoIndex !== -1
  
  // Dividir en partes: antes de "No confirmado" y después
  let beforeNoConfirmado = cleaned
  let noConfirmadoSection = ''
  let afterNoConfirmado = ''
  
  if (hasNoConfirmadoSection) {
    beforeNoConfirmado = cleaned.substring(0, noConfirmadoIndex)
    const rest = cleaned.substring(noConfirmadoIndex)
    // Encontrar dónde termina la sección "No confirmado" (siguiente sección o fin)
    const nextSectionMatch = rest.match(/\n(?:Mejoras|Falta|Preguntas|$)/i)
    if (nextSectionMatch && nextSectionMatch.index !== undefined) {
      noConfirmadoSection = rest.substring(0, nextSectionMatch.index)
      afterNoConfirmado = rest.substring(nextSectionMatch.index)
    } else {
      noConfirmadoSection = rest
    }
  }
  
  // Eliminar razonamiento interno solo ANTES de secciones estructuradas
  const reasoningPatterns = [
    /Intención\s+(?:de\s+la\s+)?pregunta[^\n]*:?\s*\n?[^\n]*\n?/gi,
    /Intención\s+detectada[^\n]*:?\s*\n?[^\n]*\n?/gi,
    /Resumen\s+basado\s+en[^\n]*:?\s*\n?[^\n]*\n?/gi,
    /Análisis\s+de\s+la\s+pregunta[^\n]*:?\s*\n?[^\n]*\n?/gi,
    /Detectando\s+intención[^\n]*:?\s*\n?[^\n]*\n?/gi,
    /Basándome\s+en\s+el\s+contexto[^\n]*:?\s*\n?[^\n]*\n?/gi,
  ]
  
  // Solo limpiar la parte antes de "No confirmado"
  reasoningPatterns.forEach(pattern => {
    beforeNoConfirmado = beforeNoConfirmado.replace(pattern, '')
  })
  
  // Eliminar lenguaje especulativo solo si está ANTES de una sección estructurada
  const lines = beforeNoConfirmado.split('\n')
  const filteredLines: string[] = []
  let foundStructuredSection = false
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    const trimmed = line.trim()
    
    // Si encontramos una sección estructurada, marcar y preservar todo después
    if (/^(Fuentes|Respuesta|Mejoras|Falta|⚠️)/i.test(trimmed)) {
      foundStructuredSection = true
    }
    
    // Solo eliminar lenguaje especulativo si NO hemos encontrado sección estructurada
    if (!foundStructuredSection && /^(Parece|Probablemente|Posiblemente|Tal vez|Quizás|Es probable que|Es posible que)/i.test(trimmed)) {
      continue // Saltar esta línea
    }
    
    filteredLines.push(line)
  }
  
  beforeNoConfirmado = filteredLines.join('\n').trim()
  
  // Reconstruir respuesta preservando sección "No confirmado"
  if (hasNoConfirmadoSection) {
    cleaned = beforeNoConfirmado + noConfirmadoSection + afterNoConfirmado
  } else {
    cleaned = beforeNoConfirmado
  }
  
  return cleaned.trim()
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
function enforceOutputFormat(answer: string, isSocial: boolean = false): string {
  // Si es una respuesta social, NO aplicar formato técnico
  if (isSocial || isSocialResponse(answer)) {
    return answer.trim()
  }
  
  // Verificar si ya tiene el formato correcto
  const hasSources = /Fuentes\s*\([^)]*\)\s*:?\s*\n?/i.test(answer)
  const hasRespuesta = /Respuesta\s*:?\s*\n?/i.test(answer)
  
  // Si ya tiene el formato básico, solo limpiar
  if (hasSources && hasRespuesta) {
    return answer
  }
  
  const trimmed = answer.trim()
  if (!trimmed) {
    return "Fuentes:\nRespuesta:\nMejoras / Riesgos:\nFalta contexto:"
  }
  
  // SOLO forzar formato si:
  // - no es social
  // - y el texto tiene más de 200 caracteres
  // - y parece una respuesta técnica (contiene rutas, extensiones, términos técnicos)
  const isTechnicalAnswer = trimmed.length > 200 && (
    trimmed.includes('/') || 
    trimmed.includes('.ts') || 
    trimmed.includes('.js') ||
    trimmed.includes('config') ||
    trimmed.includes('archivo') ||
    trimmed.includes('componente') ||
    trimmed.includes('función') ||
    trimmed.includes('módulo')
  )
  
  // Si es corta y no parece técnica, dejarla vivir sin forzar formato
  if (!isTechnicalAnswer) {
    return trimmed
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

  // Buscar rutas mencionadas en formato natural dentro del bloque
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
 * Formatea las métricas del repositorio como texto estructurado para incluir en el contexto
 */
function formatMetricsForContext(metrics: RepositoryMetrics | null | undefined): string {
  if (!metrics) {
    return ""
  }

  const parts: string[] = []
  parts.push("MÉTRICAS DEL REPOSITORIO:")
  parts.push(`Generadas: ${metrics.generatedAt}`)
  parts.push(`Commit indexado: ${metrics.indexCommit}`)
  parts.push("")

  // Estructura general
  parts.push("ESTRUCTURA:")
  parts.push(`- Total de archivos: ${metrics.structure.totalFiles}`)
  parts.push(`- Total de líneas: ${metrics.structure.totalLines}`)
  parts.push("")

  // Carpetas principales (top 10)
  if (metrics.structure.folders.length > 0) {
    parts.push("CARPETAS PRINCIPALES (por líneas):")
    const topFolders = metrics.structure.folders
      .sort((a, b) => b.lines - a.lines)
      .slice(0, 10)
    topFolders.forEach(folder => {
      parts.push(`- ${folder.path}: ${folder.files} archivos, ${folder.lines} líneas`)
    })
    parts.push("")
  }

  // Lenguajes
  if (metrics.languages.length > 0) {
    parts.push("LENGUAJES:")
    metrics.languages
      .sort((a, b) => b.lines - a.lines)
      .forEach(lang => {
        parts.push(`- ${lang.ext}: ${lang.files} archivos, ${lang.lines} líneas`)
      })
    parts.push("")
  }

  // Archivos más importados (top 10)
  if (metrics.relations.mostImported.length > 0) {
    parts.push("ARCHIVOS MÁS IMPORTADOS (más dependencias):")
    metrics.relations.mostImported.slice(0, 10).forEach(item => {
      parts.push(`- ${item.path}: importado por ${item.importedByCount} archivos`)
    })
    parts.push("")
  }

  // Archivos que más importan (top 10)
  if (metrics.relations.mostImports.length > 0) {
    parts.push("ARCHIVOS QUE MÁS IMPORTAN (más dependencias externas):")
    metrics.relations.mostImports.slice(0, 10).forEach(item => {
      parts.push(`- ${item.path}: importa ${item.importsCount} archivos`)
    })
    parts.push("")
  }

  // Entrypoints
  if (metrics.entrypoints.length > 0) {
    parts.push("ENTRYPOINTS DETECTADOS:")
    metrics.entrypoints.forEach(entrypoint => {
      const reasonText = 
        entrypoint.reason === "filename" ? "nombre de archivo" :
        entrypoint.reason === "location" ? "ubicación" :
        entrypoint.reason === "config" ? "configuración" :
        entrypoint.reason
      parts.push(`- ${entrypoint.path} (razón: ${reasonText})`)
    })
    parts.push("")
  }

  return parts.join("\n")
}

/**
 * POST /internal/llm/query
 * Endpoint interno para procesar queries LLM
 * 
 * ⚠️ Este endpoint NO es público y solo debe ser llamado por ControlFile
 * ⚠️ NO valida autenticación de usuario final
 */
export async function POST(request: NextRequest) {
  const startTime = Date.now()
  
  try {
    const body: InternalLLMQueryRequest = await request.json()
    const { question, repositoryId, context, role, conversationMemory, options } = body
    
    // Determinar el rol del asistente (por defecto: architecture-explainer)
    const assistantRole: AssistantRole = role && (role === "architecture-explainer" || role === "structure-auditor")
      ? role
      : DEFAULT_ROLE

    // Validar inputs requeridos
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

    if (!context || !context.index) {
      return NextResponse.json(
        { error: "context.index es requerido" },
        { status: 400 }
      )
    }

    if (!context.index.files || !Array.isArray(context.index.files)) {
      return NextResponse.json(
        { error: "context.index.files debe ser un array" },
        { status: 400 }
      )
    }

    // Obtener datos del contexto recibido
    const index = context.index
    const projectBrain = context.projectBrain
    const metrics = context.metrics

    // Validar que el índice tenga archivos
    if (index.files.length === 0) {
      return NextResponse.json(
        { error: "El índice del repositorio está vacío" },
        { status: 400 }
      )
    }

    // Buscar archivos relevantes usando searchFiles
    const query = question.trim()
    
    // Detectar si es intención social
    const isSocial = isSocialIntent(query)
    
    let relevantFiles = searchFiles(index.files, query)

    // Si no hay archivos relevantes, buscar archivos de documentación por defecto
    if (relevantFiles.length === 0) {
      // Detectar si la pregunta es general/exploratoria
      const isGeneralQuestion = /^(de\s+qu[ée]|qu[ée]\s+es|qu[ée]\s+hace|sobre\s+qu[ée]|acerca\s+de|qu[ée]\s+trata|objetivo|prop[óo]sito|para\s+qu[ée])/i.test(query)
      
      if (isGeneralQuestion) {
        // Buscar archivos de documentación clave
        const docFiles = index.files.filter((file: IndexedFile) => 
          file.isDocumentation || 
          file.isKeyFile || 
          file.name.toLowerCase() === 'readme.md' ||
          file.path.toLowerCase().includes('/docs/') ||
          file.category === 'docs'
        )
        
        // Priorizar README y docs principales
        const readme = docFiles.find((f: IndexedFile) => f.name.toLowerCase() === 'readme.md')
        const docs = docFiles.filter((f: IndexedFile) => 
          f.path.toLowerCase().includes('/docs/') && f.name.endsWith('.md')
        ).slice(0, 5) // Máximo 5 archivos de docs
        
        relevantFiles = []
        if (readme) relevantFiles.push(readme)
        relevantFiles.push(...docs)
        
        // Si aún no hay archivos, incluir cualquier archivo de documentación
        if (relevantFiles.length === 0 && docFiles.length > 0) {
          relevantFiles = docFiles.slice(0, 5)
        }
      }
    }

    // Construir contexto de texto con metadata de los archivos
    const contextParts: string[] = []

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

    // Convertir Project Brain a texto plano
    let projectBrainText = ""
    if (projectBrain) {
      const mainLanguages = projectBrain.summary.mainLanguages?.join(", ") || "N/A"
      projectBrainText = `PROJECT BRAIN (Contexto del Repositorio):
Repository ID: ${projectBrain.repositoryId}
Created: ${projectBrain.createdAt}
Total Files: ${projectBrain.summary.totalFiles}
Main Languages: ${mainLanguages}

`
    }

    // Formatear métricas como texto estructurado
    const metricsText = formatMetricsForContext(metrics)

    // Construir prompt usando el sistema de roles con memoria de conversación
    const fullContextParts: string[] = []
    if (projectBrainText) {
      fullContextParts.push(projectBrainText)
    }
    
    // Inyectar métricas si existen
    if (metricsText) {
      fullContextParts.push(metricsText)
    }
    
    fullContextParts.push(contextText)
    const fullContext = fullContextParts.join("\n")
    
    // Formatear memoria de conversación para el prompt
    const formattedMemory = conversationMemory ? {
      previousIntents: [],
      usedSources: [],
      findings: { improvements: [], risks: [] },
      previousRole: assistantRole
    } : null
    
    const prompt = getSystemPrompt(assistantRole, fullContext, query, formattedMemory)

    // Determinar motor LLM a usar
    const engine = options?.engine || "ollama"
    const model = options?.model || "phi3:mini"
    const includeDebug = options?.includeDebug !== false // Por defecto incluir debug

    // Llamar a Ollama local
    const retrievalTime = Date.now() - startTime
    let ollamaResponse
    let generationTime = 0
    
    try {
      const generationStartTime = Date.now()
      
      const ollamaRequest = await fetch("http://localhost:11434/api/generate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: model,
          prompt: prompt,
          stream: false,
        }),
      })

      if (!ollamaRequest.ok) {
        throw new Error(`Error de Ollama: ${ollamaRequest.statusText}`)
      }

      ollamaResponse = await ollamaRequest.json()
      generationTime = Date.now() - generationStartTime
    } catch (error) {
      // Si Ollama no está disponible, devolver respuesta de fallback
      console.error("Error al llamar a Ollama:", error)
      return NextResponse.json(
        {
          error: "Ollama no está disponible. Asegúrate de que Ollama esté ejecutándose en http://localhost:11434 y que el modelo esté instalado.",
          details: error instanceof Error ? error.message : "Error desconocido",
        },
        { status: 503 }
      )
    }

    // Extraer respuesta del modelo
    const rawAnswer = ollamaResponse.response || ollamaResponse.text || "No se pudo generar una respuesta."
    
    // Si es intención social, procesar de forma simplificada
    if (isSocial) {
      const cleanedAnswer = cleanAnswerFromInternalReasoning(rawAnswer)
      const formattedAnswer = enforceOutputFormat(cleanedAnswer.trim(), true)
      
      const latency = (Date.now() - startTime) / 1000
      
      const response: InternalLLMQueryResponse = {
        answer: formattedAnswer,
        files: [],
        findings: {
          improvements: [],
          risks: [],
        },
        timestamp: new Date().toISOString(),
      }
      
      if (includeDebug) {
        response.debug = {
          engine: engine as "ollama" | "cloud",
          model: model,
          location: "local",
          latency: latency,
          retrievalTime: retrievalTime / 1000,
          generationTime: generationTime / 1000,
        }
      }
      
      return NextResponse.json(response)
    }
    
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
    const formattedAnswer = enforceOutputFormat(finalAnswer.trim(), false)
    
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
    })

    const latency = (Date.now() - startTime) / 1000

    const response: InternalLLMQueryResponse = {
      answer: formattedAnswer,
      files: declaredFiles.length > 0 ? declaredFiles : [],
      findings: {
        improvements: findings.improvements,
        risks: findings.risks,
      },
      timestamp: new Date().toISOString(),
    }
    
    if (includeDebug) {
      response.debug = {
        engine: engine as "ollama" | "cloud",
        model: model,
        location: "local",
        latency: latency,
        retrievalTime: retrievalTime / 1000,
        generationTime: generationTime / 1000,
      }
    }

    return NextResponse.json(response)
  } catch (error) {
    console.error("Error en POST /internal/llm/query:", error)
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Error desconocido",
      },
      { status: 500 }
    )
  }
}

/**
 * Generador de flows.json
 * Analiza el repositorio completo y genera flujos usando un prompt fijo
 */

import { RepositoryIndex } from "@/lib/types/repository"
import { RepositoryFlows } from "@/lib/types/flows"

/**
 * Prompt fijo para Flow Generator v1
 */
const FLOW_GENERATOR_PROMPT_V1 = `Analizá el repositorio completo y generá exclusivamente un JSON válido con flujos del sistema.

INSTRUCCIONES:
1. Analizá la estructura del repositorio, archivos clave, componentes, servicios y rutas.
2. Identificá SOLO los flujos que tengan evidencia clara en el código (rutas API, componentes de flujo, handlers, etc.).
3. Para cada flujo identificado, definí pasos claros con acciones específicas.
4. Relacioná cada flujo y paso con los archivos relevantes del repositorio.
5. Si NO hay evidencia clara de flujos explícitos, devolvé flows: [] y documentalo en metadata.notes.
6. Emití SOLO un JSON válido siguiendo este schema exacto:

{
  "version": 1,
  "schema": "repository-flows-v1",
  "generatedAt": "ISO_DATE",
  "indexCommit": "COMMIT_SHA",
  "repositoryId": "owner/repo",
  "flows": [
    {
      "id": "flow-id-unico",
      "name": "Nombre del Flujo",
      "description": "Descripción del flujo",
      "steps": [
        {
          "step": 1,
          "name": "Nombre del Paso",
          "description": "Descripción del paso",
          "actor": "usuario|sistema|api",
          "action": "Acción específica",
          "nextSteps": [2],
          "conditions": ["condición opcional"],
          "relatedFiles": ["path/to/file.ts"]
        }
      ],
      "triggers": [
        {
          "actor": "user",
          "action": "acción que inicia el flujo",
          "source": "origen opcional"
        }
      ],
      "actors": ["entidades participantes"],
      "relatedFiles": ["path/to/file.ts"]
    }
  ],
  "metadata": {
    "totalFlows": 0,
    "mainFlows": ["flow-id-principal"],
    "categories": ["categoría1", "categoría2"],
    "notes": "notas opcionales sobre la generación"
  }
}

NOTA IMPORTANTE: flows puede ser un array vacío [] si no se detectan flujos explícitos. En ese caso, documentalo en metadata.notes.

REGLAS CRÍTICAS:
- Emití SOLO el JSON, sin texto adicional antes o después.
- flows: [] es un resultado VÁLIDO y PREFERIBLE sobre inventar flujos sin evidencia.
- Si flows tiene elementos, cada flujo debe tener al menos 2 pasos.
- Los IDs de flujos deben ser únicos y descriptivos.
- Los números de paso (step) deben comenzar en 1 y ser secuenciales dentro de cada flujo.
- Los nextSteps deben referenciar números de paso válidos dentro del mismo flujo.
- Los relatedFiles deben ser paths reales del repositorio.
- NUNCA inventes flujos genéricos (como "navegación", "autenticación", etc.) si no hay evidencia clara en el código.
- Si no hay información suficiente para identificar flujos explícitos, devolvé flows: [] y documentalo en metadata.notes.
- La ausencia de flujos explícitos es un resultado válido y debe ser respetada.

CONTEXTO DEL REPOSITORIO:
{context}

NOTA FINAL CRÍTICA:
La ausencia de flujos explícitos es un resultado VÁLIDO y PREFERIBLE. 
Si no podés identificar flujos claros basándote en el código, devolvé un JSON válido con flows: [] y explicalo en metadata.notes.
NO inventes flujos genéricos para "completar" el resultado. Un flows: [] con metadata.notes explicando por qué no se detectaron flujos es mejor que flujos inventados.

Ejemplo de JSON válido cuando NO hay flujos detectados:
{
  "version": 1,
  "schema": "repository-flows-v1",
  "generatedAt": "ISO_DATE",
  "indexCommit": "COMMIT_SHA",
  "repositoryId": "owner/repo",
  "flows": [],
  "metadata": {
    "totalFlows": 0,
    "notes": "No se detectaron flujos explícitos en el código. El repositorio parece ser principalmente librería/utilidades sin flujos de usuario definidos."
  }
}

Generá el JSON ahora:`

/**
 * Construye el contexto del repositorio para el prompt
 */
function buildRepositoryContext(index: RepositoryIndex): string {
  const parts: string[] = []
  
  // Información básica
  parts.push(`REPOSITORIO: ${index.id}`)
  parts.push(`RAMA: ${index.branch}`)
  parts.push(`COMMIT: ${index.lastCommit}`)
  parts.push(`TOTAL ARCHIVOS: ${index.summary.totalFiles}`)
  parts.push(`TOTAL LÍNEAS: ${index.summary.totalLines}`)
  parts.push("")
  
  // Archivos clave
  if (index.keyFiles.readme) {
    parts.push(`README: ${index.keyFiles.readme}`)
  }
  if (index.keyFiles.packageJson) {
    parts.push(`PACKAGE.JSON: ${index.keyFiles.packageJson}`)
  }
  if (index.keyFiles.nextConfig) {
    parts.push(`NEXT.CONFIG: ${index.keyFiles.nextConfig}`)
  }
  if (index.keyFiles.docs && index.keyFiles.docs.length > 0) {
    parts.push(`DOCS: ${index.keyFiles.docs.join(", ")}`)
  }
  parts.push("")
  
  // Estructura de carpetas principales
  const folderMap = new Map<string, number>()
  index.files.forEach(file => {
    const dir = file.directory || "/"
    folderMap.set(dir, (folderMap.get(dir) || 0) + 1)
  })
  
  const topFolders = Array.from(folderMap.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
  
  if (topFolders.length > 0) {
    parts.push("CARPETAS PRINCIPALES:")
    topFolders.forEach(([folder, count]) => {
      parts.push(`- ${folder}: ${count} archivos`)
    })
    parts.push("")
  }
  
  // Archivos más importantes (por imports)
  const mostImported = index.files
    .filter(f => f.relations.importedBy && f.relations.importedBy.length > 0)
    .sort((a, b) => (b.relations.importedBy?.length || 0) - (a.relations.importedBy?.length || 0))
    .slice(0, 20)
  
  if (mostImported.length > 0) {
    parts.push("ARCHIVOS MÁS IMPORTADOS (más dependencias):")
    mostImported.forEach(file => {
      const importedBy = file.relations.importedBy?.length || 0
      parts.push(`- ${file.path}: importado por ${importedBy} archivos`)
      if (file.summary.description) {
        parts.push(`  Descripción: ${file.summary.description}`)
      }
      if (file.summary.exports && file.summary.exports.length > 0) {
        parts.push(`  Exports: ${file.summary.exports.join(", ")}`)
      }
    })
    parts.push("")
  }
  
  // Componentes principales
  const components = index.files
    .filter(f => f.category === "component")
    .slice(0, 20)
  
  if (components.length > 0) {
    parts.push("COMPONENTES PRINCIPALES:")
    components.forEach(comp => {
      parts.push(`- ${comp.path}`)
      if (comp.summary.description) {
        parts.push(`  Descripción: ${comp.summary.description}`)
      }
      if (comp.summary.exports && comp.summary.exports.length > 0) {
        parts.push(`  Exports: ${comp.summary.exports.join(", ")}`)
      }
    })
    parts.push("")
  }
  
  // Servicios/API routes
  const apiRoutes = index.files
    .filter(f => f.path.includes("/api/") || f.path.includes("/route"))
    .slice(0, 20)
  
  if (apiRoutes.length > 0) {
    parts.push("RUTAS API:")
    apiRoutes.forEach(route => {
      parts.push(`- ${route.path}`)
      if (route.summary.description) {
        parts.push(`  Descripción: ${route.summary.description}`)
      }
    })
    parts.push("")
  }
  
  // Nota final importante
  parts.push("NOTA:")
  parts.push("La ausencia de flujos explícitos debe ser considerada válida.")
  parts.push("Si no hay evidencia clara de flujos en el código, devolvé flows: [] y documentalo en metadata.notes.")
  
  return parts.join("\n")
}

/**
 * Extrae JSON de la respuesta del modelo, intentando múltiples estrategias
 */
function extractJSONFromResponse(rawResponse: string): string | null {
  // Estrategia 1: Buscar JSON completo entre llaves (más común)
  const jsonMatch = rawResponse.match(/\{[\s\S]*\}/)
  if (jsonMatch) {
    return jsonMatch[0]
  }
  
  // Estrategia 2: Buscar entre delimitadores <json>...</json> (si se implementa en el futuro)
  const delimitedMatch = rawResponse.match(/<json>([\s\S]*)<\/json>/i)
  if (delimitedMatch) {
    return delimitedMatch[1].trim()
  }
  
  // Estrategia 3: Buscar desde la primera { hasta la última }
  const firstBrace = rawResponse.indexOf('{')
  const lastBrace = rawResponse.lastIndexOf('}')
  if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
    return rawResponse.substring(firstBrace, lastBrace + 1)
  }
  
  return null
}

/**
 * Genera flows.json usando Ollama con el prompt fijo
 */
export async function generateFlows(
  index: RepositoryIndex,
  owner: string,
  repo: string,
  branch: string
): Promise<RepositoryFlows> {
  const now = new Date().toISOString()
  
  // Construir contexto del repositorio
  const context = buildRepositoryContext(index)
  
  // Construir prompt completo
  const prompt = FLOW_GENERATOR_PROMPT_V1.replace("{context}", context)
  
  // Llamar a Ollama
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
    console.error("Error al llamar a Ollama:", error)
    throw new Error(
      `Error al generar flows: ${error instanceof Error ? error.message : "Error desconocido"}. ` +
      `Asegúrate de que Ollama esté ejecutándose en http://localhost:11434 y que el modelo 'phi3:mini' esté instalado.`
    )
  }

  // Extraer respuesta del modelo
  const rawResponse = ollamaResponse.response || ollamaResponse.text || ""
  
  // Intentar extraer JSON de la respuesta
  let flowsData: RepositoryFlows
  
  try {
    // Extraer JSON usando estrategias múltiples
    const jsonString = extractJSONFromResponse(rawResponse)
    
    if (!jsonString) {
      throw new Error("No se encontró JSON válido en la respuesta de Ollama")
    }
    
    flowsData = JSON.parse(jsonString)
    
    // Validar estructura básica
    if (!Array.isArray(flowsData.flows)) {
      throw new Error("El JSON generado no tiene la estructura esperada: flows debe ser un array")
    }
    
    // Completar metadatos requeridos
    flowsData.version = flowsData.version || 1
    flowsData.schema = flowsData.schema || "repository-flows-v1"
    flowsData.generatedAt = flowsData.generatedAt || now
    flowsData.indexCommit = flowsData.indexCommit || index.lastCommit
    flowsData.repositoryId = flowsData.repositoryId || index.id
    
    // Completar metadata si no existe
    if (!flowsData.metadata) {
      flowsData.metadata = {
        totalFlows: flowsData.flows.length,
      }
    } else {
      flowsData.metadata.totalFlows = flowsData.flows.length
    }
    
    // Validar que los pasos tengan step como número
    for (const flow of flowsData.flows) {
      if (!flow.steps || !Array.isArray(flow.steps)) {
        continue
      }
      
      for (const step of flow.steps) {
        // Asegurar que step sea número
        if (typeof step.step !== "number") {
          // Intentar convertir si es string
          const stepNum = parseInt(String(step.step), 10)
          if (!isNaN(stepNum)) {
            step.step = stepNum
          } else {
            throw new Error(`Paso inválido en flujo ${flow.id}: step debe ser un número`)
          }
        }
        
        // Validar nextSteps si existen
        if (step.nextSteps && Array.isArray(step.nextSteps)) {
          step.nextSteps = step.nextSteps.map(ns => {
            if (typeof ns === "string") {
              const num = parseInt(ns, 10)
              return isNaN(num) ? ns : num
            }
            return typeof ns === "number" ? ns : parseInt(String(ns), 10)
          }).filter(ns => !isNaN(ns as number)) as number[]
        }
      }
    }
    
  } catch (error) {
    console.error("Error al parsear respuesta de Ollama:", error)
    console.error("Respuesta cruda:", rawResponse)
    throw new Error(
      `Error al parsear flows generados: ${error instanceof Error ? error.message : "Error desconocido"}`
    )
  }
  
  return flowsData
}


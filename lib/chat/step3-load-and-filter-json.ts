/**
 * Paso 3 del Chat Orquestador
 * Carga y filtrado de fuentes JSON seleccionadas
 *
 * - Carga SOLO los JSON elegidos en el Paso 2
 * - Filtra contenido relevante según la pregunta
 * - Devuelve contexto estructurado
 * - Indica si la info parece suficiente
 */

import { readFile } from "fs/promises"
import { join } from "path"
import type { JsonSourceType, SelectedJsonSource } from "./step2-select-json-sources"
import type { QuestionAnalysis } from "./step1-question-analysis"

/* -------------------------------------------
 * Tipos de salida
 * ------------------------------------------- */

export interface JsonContextChunk {
  source: JsonSourceType
  summary: string
  data: any
}

export interface JsonContextResult {
  chunks: JsonContextChunk[]
  sufficient: boolean
  notes?: string
}

/* -------------------------------------------
 * Resolución de paths por tipo de JSON
 * Ajustá estos paths a tu proyecto
 * ------------------------------------------- */

function resolveJsonPath(
  repositoryId: string,
  jsonType: JsonSourceType
): string {
  const base = join(process.cwd(), ".repository-analysis", repositoryId)

  switch (jsonType) {
    case "flows":
      return join(base, "flows.json")

    case "architecture":
      return join(base, "architecture.json")

    case "modules":
      return join(base, "modules.json")

    case "components":
      return join(base, "components.json")

    case "files-map":
      return join(base, "files-map.json")

    case "config":
      return join(base, "config.json")

    default:
      throw new Error(`JSON source no soportado: ${jsonType}`)
  }
}

/* -------------------------------------------
 * Utilidad: filtrar texto simple
 * ------------------------------------------- */

function textMatchesQuestion(text: string, normalizedQuestion: string): boolean {
  const tokens = normalizedQuestion.split(" ").filter(t => t.length > 3)
  return tokens.some(token => text.toLowerCase().includes(token))
}

/* -------------------------------------------
 * Filtros específicos por JSON
 * ------------------------------------------- */

function filterFlows(flowsJson: any, question: QuestionAnalysis) {
  if (!flowsJson?.flows || !Array.isArray(flowsJson.flows)) return []

  return flowsJson.flows.filter((flow: any) => {
    if (textMatchesQuestion(flow.name || "", question.normalizedQuestion)) return true
    if (textMatchesQuestion(flow.description || "", question.normalizedQuestion)) return true
    return false
  })
}

function filterGenericArray(items: any[], question: QuestionAnalysis) {
  return items.filter(item => {
    const blob = JSON.stringify(item).toLowerCase()
    return textMatchesQuestion(blob, question.normalizedQuestion)
  })
}

/* -------------------------------------------
 * Paso 3 principal
 * ------------------------------------------- */

export async function loadAndFilterJsonSources(
  repositoryId: string,
  selectedSources: SelectedJsonSource[],
  question: QuestionAnalysis
): Promise<JsonContextResult> {
  const chunks: JsonContextChunk[] = []

  for (const source of selectedSources) {
    try {
      const path = resolveJsonPath(repositoryId, source.type)
      const raw = await readFile(path, "utf-8")
      const json = JSON.parse(raw)

      let filteredData: any = null

      switch (source.type) {
        case "flows": {
          const flows = filterFlows(json, question)
          if (flows.length > 0) {
            filteredData = {
              flows,
            }
          }
          break
        }

        case "modules":
        case "components":
        case "architecture":
        case "files-map":
        case "config": {
          if (Array.isArray(json)) {
            const filtered = filterGenericArray(json, question)
            if (filtered.length > 0) {
              filteredData = filtered
            }
          } else if (json && typeof json === "object") {
            filteredData = json
          }
          break
        }
      }

      if (filteredData) {
        chunks.push({
          source: source.type,
          summary: `Datos relevantes encontrados en ${source.type}.json`,
          data: filteredData,
        })
      }
    } catch (error) {
      chunks.push({
        source: source.type,
        summary: `No se pudo cargar ${source.type}.json`,
        data: null,
      })
    }
  }

  const sufficient = chunks.length > 0

  return {
    chunks,
    sufficient,
    notes: sufficient
      ? undefined
      : "Los JSON consultados no contienen información suficiente para responder la pregunta",
  }
}

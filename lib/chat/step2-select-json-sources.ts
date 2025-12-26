/**
 * Paso 2 del Chat Orquestador
 * Selección blanda de fuentes JSON a consultar
 *
 * - Usa señales del Paso 1
 * - Selecciona máx. 2 fuentes
 * - Justifica cada selección
 * - No decide archivos aún
 */

import type { QuestionSignal } from "./step1-question-analysis"

export type JsonSourceType =
  | "flows"
  | "architecture"
  | "modules"
  | "components"
  | "files-map"
  | "config"

export interface SelectedJsonSource {
  type: JsonSourceType
  reason: string
  signal: QuestionSignal
  weight: number
}

export interface JsonSelectionResult {
  selected: SelectedJsonSource[]
  discardedSignals: QuestionSignal[]
}

/* -------------------------------------------
 * Mapeo señal → JSON
 * ------------------------------------------- */

const SIGNAL_TO_JSON: Record<QuestionSignal, JsonSourceType | null> = {
  flow: "flows",
  bug: "flows",

  component: "components",
  module: "modules",

  architecture: "architecture",

  file: "files-map",

  config: "config",

  improvement: null, // mejora no define fuente, se apoya en contexto
  existence: null,   // existencia se resuelve con otras señales
}

/* -------------------------------------------
 * Paso 2 principal
 * ------------------------------------------- */

export function selectJsonSources(
  signals: Record<QuestionSignal, number>,
  maxSources = 2
): JsonSelectionResult {
  // Convertir señales en lista ordenable
  const rankedSignals = Object.entries(signals)
    .filter(([, weight]) => weight > 0)
    .map(([signal, weight]) => ({
      signal: signal as QuestionSignal,
      weight,
      json: SIGNAL_TO_JSON[signal as QuestionSignal],
    }))
    // descartar señales sin JSON asociado
    .filter(item => item.json !== null)
    // ordenar por peso descendente
    .sort((a, b) => b.weight - a.weight)

  const selected: SelectedJsonSource[] = []
  const usedJsonTypes = new Set<JsonSourceType>()

  for (const item of rankedSignals) {
    if (selected.length >= maxSources) break
    const jsonType = item.json as JsonSourceType

    // evitar duplicar mismo JSON
    if (usedJsonTypes.has(jsonType)) continue

    selected.push({
      type: jsonType,
      signal: item.signal,
      weight: item.weight,
      reason: `Señal '${item.signal}' con peso ${item.weight}`,
    })

    usedJsonTypes.add(jsonType)
  }

  const discardedSignals = Object.keys(signals)
    .filter(
      s =>
        signals[s as QuestionSignal] > 0 &&
        !selected.some(sel => sel.signal === s)
    ) as QuestionSignal[]

  return {
    selected,
    discardedSignals,
  }
}

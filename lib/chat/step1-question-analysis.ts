/**
 * Paso 1 del Chat Orquestador
 * Análisis blando de la pregunta del usuario
 * - NO decide
 * - NO responde
 * - NO usa IA
 * - Extrae señales probabilísticas
 */

export type QuestionSignal =
  | "flow"
  | "architecture"
  | "module"
  | "component"
  | "file"
  | "config"
  | "bug"
  | "improvement"
  | "existence"

export interface QuestionAnalysis {
  originalQuestion: string
  normalizedQuestion: string
  signals: Record<QuestionSignal, number>
  notes?: string
}

/* -------------------------------------------
 * Normalización de texto
 * ------------------------------------------- */

export function normalizeQuestion(input: string): string {
  return input
    .toLowerCase()
    .normalize("NFD")                 // separa tildes
    .replace(/[\u0300-\u036f]/g, "")  // elimina tildes
    .replace(/[^a-z0-9\s?]/g, " ")    // limpia símbolos raros
    .replace(/\s+/g, " ")             // colapsa espacios
    .trim()
}

/* -------------------------------------------
 * Diccionario de señales (familias)
 * ------------------------------------------- */

const SIGNAL_PATTERNS: Record<QuestionSignal, string[]> = {
  flow: [
    "como funciona",
    "funciona",
    "flujo",
    "proceso",
    "paso",
    "paso a paso",
    "de donde sale",
    "que pasa cuando",
  ],

  architecture: [
    "arquitectura",
    "estructura",
    "sistema",
    "general",
  ],

  module: [
    "modulo",
    "feature",
    "parte",
  ],

  component: [
    "componente",
    "ui",
    "pantalla",
    "vista",
    "que hace esto",
    "que hace",
  ],

  file: [
    "archivo",
    "donde esta",
    "donde se define",
    "path",
  ],

  config: [
    "config",
    "configuracion",
    "env",
    "variable",
    "ajuste",
  ],

  bug: [
    "no anda",
    "no funciona",
    "falla",
    "error",
    "rompe",
    "bug",
    "problema",
  ],

  improvement: [
    "mejorar",
    "optimizar",
    "refactor",
    "alternativa",
    "mejor forma",
    "se puede mejorar",
  ],

  existence: [
    "existe",
    "tenemos",
    "hay",
    "esta implementado",
  ],
}

/* -------------------------------------------
 * Utilidad: suma señales sin pasar de 1
 * ------------------------------------------- */

function addSignal(
  signals: Record<QuestionSignal, number>,
  signal: QuestionSignal,
  weight: number
) {
  signals[signal] = Math.min(1, signals[signal] + weight)
}

/* -------------------------------------------
 * Extracción de señales
 * ------------------------------------------- */

export function extractSignals(normalized: string): Record<QuestionSignal, number> {
  const signals: Record<QuestionSignal, number> = {
    flow: 0,
    architecture: 0,
    module: 0,
    component: 0,
    file: 0,
    config: 0,
    bug: 0,
    improvement: 0,
    existence: 0,
  }

  for (const [signal, patterns] of Object.entries(SIGNAL_PATTERNS)) {
    for (const pattern of patterns) {
      if (normalized.includes(pattern)) {
        addSignal(signals, signal as QuestionSignal, 0.4)
      }
    }
  }

  return signals
}

/* -------------------------------------------
 * Paso 1 completo
 * ------------------------------------------- */

export function analyzeQuestion(question: string): QuestionAnalysis {
  const normalized = normalizeQuestion(question)
  const signals = extractSignals(normalized)

  let notes: string | undefined

  const totalSignalStrength = Object.values(signals).reduce((a, b) => a + b, 0)

  if (totalSignalStrength === 0) {
    notes = "Pregunta ambigua o genérica; no se detectaron señales claras"
  }

  if (
    signals.flow > 0 &&
    signals.component === 0 &&
    signals.file === 0 &&
    !normalized.match(/\b[a-z0-9_-]{3,}\b/)
  ) {
    notes = "Pregunta de funcionamiento sin objeto explícito"
  }

  return {
    originalQuestion: question,
    normalizedQuestion: normalized,
    signals,
    notes,
  }
}

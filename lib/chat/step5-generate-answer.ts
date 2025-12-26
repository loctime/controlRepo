/**
 * Paso 5 del Chat Orquestador
 * Construcción del prompt final + llamada al modelo
 *
 * - Usa SOLO el contexto ya seleccionado
 * - Impone reglas estrictas de veracidad
 * - Devuelve respuesta + fuentes usadas
 */

import type { QuestionAnalysis } from "./step1-question-analysis"
import type { JsonContextResult } from "./step3-load-and-filter-json"
import type { RepoFilesResult } from "./step4-select-and-load-repo-files"

/* -------------------------------------------
 * Tipos de salida
 * ------------------------------------------- */

export interface ChatAnswerResult {
  answer: string
  confidence: "high" | "medium" | "low"
  sources: {
    json?: string[]
    files?: string[]
  }
  notes?: string
}

/* -------------------------------------------
 * Prompt de sistema (CRÍTICO)
 * ------------------------------------------- */

function buildSystemPrompt(): string {
  return `
SOS un asistente técnico de documentación de repositorios.

REGLAS ABSOLUTAS:
- Usá EXCLUSIVAMENTE la información provista en el CONTEXTO.
- NO inventes funcionalidades, flujos, archivos ni comportamientos.
- Si la información NO alcanza, decilo explícitamente.
- NO completes con suposiciones.
- NO expliques más allá de la evidencia.
- Citá siempre los archivos o JSON usados.
- Si el contexto es ambiguo, señalalo.

Estilo de respuesta:
- Clara
- Técnica
- Directa
- Sin relleno
`
}

/* -------------------------------------------
 * Construcción del contexto textual
 * ------------------------------------------- */

function buildContext(
  jsonContext: JsonContextResult,
  repoFiles?: RepoFilesResult
): { text: string; sources: { json: string[]; files: string[] } } {
  const jsonSources: string[] = []
  const fileSources: string[] = []
  const parts: string[] = []

  if (jsonContext.chunks.length > 0) {
    parts.push("### CONTEXTO JSON")
    for (const chunk of jsonContext.chunks) {
      jsonSources.push(`${chunk.source}.json`)
      parts.push(`\n--- ${chunk.source}.json ---`)
      parts.push(JSON.stringify(chunk.data, null, 2))
    }
  }

  if (repoFiles && repoFiles.files.length > 0) {
    parts.push("\n### ARCHIVOS DEL REPOSITORIO")
    for (const file of repoFiles.files) {
      fileSources.push(file.path)
      parts.push(`\n--- ${file.path} ---`)
      parts.push(file.content)
    }
  }

  return {
    text: parts.join("\n"),
    sources: {
      json: jsonSources,
      files: fileSources,
    },
  }
}

/* -------------------------------------------
 * Evaluación de confianza
 * ------------------------------------------- */

function evaluateConfidence(
  jsonContext: JsonContextResult,
  repoFiles?: RepoFilesResult
): "high" | "medium" | "low" {
  if (jsonContext.chunks.length > 0 && !repoFiles) return "high"
  if (jsonContext.chunks.length > 0 && repoFiles?.files.length) return "medium"
  return "low"
}

/* -------------------------------------------
 * Llamada al modelo (Ollama)
 * ------------------------------------------- */

async function callOllama(prompt: string): Promise<string> {
  const response = await fetch("http://localhost:11434/api/generate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "phi3:mini",
      prompt,
      stream: false,
    }),
  })

  if (!response.ok) {
    throw new Error(`Error Ollama: ${response.statusText}`)
  }

  const data = await response.json()
  return data.response || data.text || ""
}

/* -------------------------------------------
 * Paso 5 principal
 * ------------------------------------------- */

export async function generateAnswer(
  question: QuestionAnalysis,
  jsonContext: JsonContextResult,
  repoFiles?: RepoFilesResult
): Promise<ChatAnswerResult> {
  const systemPrompt = buildSystemPrompt()

  const { text: contextText, sources } = buildContext(jsonContext, repoFiles)

  const userPrompt = `
### PREGUNTA
${question.originalQuestion}

### CONTEXTO
${contextText}

### INSTRUCCIÓN FINAL
Respondé la pregunta usando SOLO el contexto.
Si el contexto no alcanza, indicá claramente qué falta.
`

  const fullPrompt = `${systemPrompt}\n\n${userPrompt}`

  let answerText: string

  try {
    answerText = await callOllama(fullPrompt)
  } catch (error) {
    return {
      answer: "Error al generar la respuesta desde el modelo.",
      confidence: "low",
      sources: {},
      notes: error instanceof Error ? error.message : "Error desconocido",
    }
  }

  const confidence = evaluateConfidence(jsonContext, repoFiles)

  return {
    answer: answerText.trim(),
    confidence,
    sources: {
      json: sources.json.length ? sources.json : undefined,
      files: sources.files.length ? sources.files : undefined,
    },
    notes:
      confidence === "low"
        ? "La respuesta puede ser incompleta por falta de contexto suficiente"
        : undefined,
  }
}

/**
 * Paso 5 del Chat Orquestador
 * Construcción del prompt final + llamada al modelo
 *
 * - Usa SOLO contexto ya seleccionado
 * - NO usa contenido crudo
 * - Responde en base a índice + procesos
 */

import type { QuestionAnalysis } from "./step1-question-analysis"
import type { JsonContextResult } from "./step3-load-and-filter-json"
import type { IndexedFile } from "@/lib/types/repository"

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
SOS un asistente técnico de análisis de repositorios.

REGLAS ABSOLUTAS:
- Usá EXCLUSIVAMENTE la información del CONTEXTO.
- NO inventes código, lógica ni comportamiento.
- NO asumas implementaciones internas.
- Si algo no está explícito, decilo.
- Citá siempre los archivos usados.
- Si el contexto no alcanza, indicá qué falta.

Estilo:
- Técnico
- Directo
- Verificable
- Sin relleno
`
}

/* -------------------------------------------
 * Construcción del contexto
 * ------------------------------------------- */

function buildContext(
  jsonContext: JsonContextResult,
  repoFiles?: IndexedFile[]
): { text: string; sources: { json: string[]; files: string[] } } {
  const jsonSources: string[] = []
  const fileSources: string[] = []
  const parts: string[] = []

  if (jsonContext.chunks?.length) {
    parts.push("### CONTEXTO JSON")
    for (const chunk of jsonContext.chunks) {
      jsonSources.push(`${chunk.source}.json`)
      parts.push(`\n--- ${chunk.source}.json ---`)
      parts.push(JSON.stringify(chunk.data, null, 2))
    }
  }

  if (repoFiles?.length) {
    parts.push("\n### ARCHIVOS DEL REPOSITORIO (ÍNDICE)")
    for (const file of repoFiles) {
      fileSources.push(file.path)

      parts.push(`\n--- ${file.path} ---`)
      parts.push(
        JSON.stringify(
          {
            category: file.category,
            type: file.type,
            exports: file.summary?.exports,
            functions: file.summary?.functions,
            hooks: file.summary?.hooks,
            actions: file.process?.actions,
            role: file.process?.role,
            entrypoint: file.process?.entrypoint,
            imports: file.relations?.imports,
          },
          null,
          2
        )
      )
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
  repoFiles?: IndexedFile[]
): "high" | "medium" | "low" {
  if (jsonContext.chunks?.length && !repoFiles?.length) return "high"
  if (jsonContext.chunks?.length && repoFiles?.length) return "medium"
  if (repoFiles?.length) return "medium"
  return "low"
}

/* -------------------------------------------
 * Llamada al modelo
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
  return data.response || ""
}

/* -------------------------------------------
 * Paso 5 principal
 * ------------------------------------------- */

export async function generateAnswer(
  question: QuestionAnalysis,
  jsonContext: JsonContextResult,
  repoFiles?: IndexedFile[]
): Promise<ChatAnswerResult> {
  const systemPrompt = buildSystemPrompt()

  const { text: contextText, sources } = buildContext(jsonContext, repoFiles)

  const userPrompt = `
### PREGUNTA
${question.originalQuestion}

### CONTEXTO
${contextText}

### INSTRUCCIÓN FINAL
Respondé usando SOLO el contexto.
Si no alcanza, indicá explícitamente qué información falta.
`

  const fullPrompt = `${systemPrompt}\n\n${userPrompt}`

  let answerText: string

  try {
    answerText = await callOllama(fullPrompt)
  } catch (error) {
    return {
      answer: "Error al generar la respuesta.",
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
        ? "Contexto insuficiente para una respuesta completamente verificable."
        : undefined,
  }
}

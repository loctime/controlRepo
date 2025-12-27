/**
 * Paso 4 del Chat Orquestador
 * Selección y carga de archivos reales del repositorio
 *
 * Reglas:
 * - SOLO se ejecuta si el JSON no fue suficiente
 * - Prioriza archivos relacionados (relatedFiles)
 * - Máximo N archivos (configurable)
 * - No hace búsquedas libres
 * - No usa IA
 */

import { readFile } from "fs/promises"
import { join } from "path"
import type { QuestionAnalysis } from "./step1-question-analysis"
import type { JsonContextResult } from "./step3-load-and-filter-json"

/* -------------------------------------------
 * Tipos
 * ------------------------------------------- */

export interface RepoFileChunk {
  path: string
  content: string
  reason: string
}

export interface RepoFilesResult {
  files: RepoFileChunk[]
  truncated: boolean
  notes?: string
}

/* -------------------------------------------
 * Configuración segura
 * ------------------------------------------- */

const DEFAULT_MAX_FILES = 5
const MAX_FILE_SIZE_BYTES = 50_000 // evita archivos enormes

/* -------------------------------------------
 * Utilidad: normalizar paths y evitar traversal
 * ------------------------------------------- */

function safeJoin(base: string, target: string): string {
  const resolved = join(base, target)
  if (!resolved.startsWith(base)) {
    throw new Error(`Path no permitido: ${target}`)
  }
  return resolved
}

/* -------------------------------------------
 * Extraer candidatos desde JSON context
 * ------------------------------------------- */

function extractRelatedFiles(jsonContext: JsonContextResult): string[] {
  const paths = new Set<string>()

  for (const chunk of jsonContext.chunks) {
    const data = chunk.data

    if (!data) continue

    // flows.json → relatedFiles en flows y steps
    if (chunk.source === "flows" && Array.isArray(data.flows)) {
      for (const flow of data.flows) {
        if (Array.isArray(flow.relatedFiles)) {
          flow.relatedFiles.forEach((p: string) => paths.add(p))
        }
        if (Array.isArray(flow.steps)) {
          flow.steps.forEach((step: any) => {
            if (Array.isArray(step.relatedFiles)) {
              step.relatedFiles.forEach((p: string) => paths.add(p))
            }
          })
        }
      }
    }

    // genérico: buscar campos relatedFiles
    if (Array.isArray(data)) {
      data.forEach(item => {
        if (Array.isArray(item.relatedFiles)) {
          item.relatedFiles.forEach((p: string) => paths.add(p))
        }
      })
    }
  }

  return Array.from(paths)
}

/* -------------------------------------------
 * Selección final de archivos
 * ------------------------------------------- */

function selectRepoFiles(
  relatedFiles: string[],
  maxFiles: number
): string[] {
  // prioridad simple: orden natural, recorte por límite
  return relatedFiles.slice(0, maxFiles)
}

/* -------------------------------------------
 * Carga de archivos del repo
 * ------------------------------------------- */

export async function loadRepoFiles(
  repositoryRootPath: string,
  question: QuestionAnalysis,
  jsonContext: JsonContextResult,
  options?: {
    maxFiles?: number
  }
): Promise<RepoFilesResult> {
  const maxFiles = options?.maxFiles ?? DEFAULT_MAX_FILES

  const relatedFiles = extractRelatedFiles(jsonContext)

  if (relatedFiles.length === 0) {
    return {
      files: [],
      truncated: false,
      notes: "No se encontraron archivos relacionados en el contexto JSON",
    }
  }

  const selectedPaths = selectRepoFiles(relatedFiles, maxFiles)

  const files: RepoFileChunk[] = []
  let truncated = relatedFiles.length > selectedPaths.length

  for (const relativePath of selectedPaths) {
    try {
      const fullPath = safeJoin(repositoryRootPath, relativePath)
      const buffer = await readFile(fullPath)

      if (buffer.byteLength > MAX_FILE_SIZE_BYTES) {
        files.push({
          path: relativePath,
          content: buffer.toString("utf-8", 0, MAX_FILE_SIZE_BYTES),
          reason: "Archivo truncado por tamaño",
        })
        truncated = true
        continue
      }

      files.push({
        path: relativePath,
        content: buffer.toString("utf-8"),
        reason: "Archivo relacionado con el contexto detectado",
      })
    } catch (error) {
      files.push({
        path: relativePath,
        content: "",
        reason: "No se pudo cargar el archivo",
      })
    }
  }

  return {
    files,
    truncated,
    notes: truncated
      ? "Algunos archivos fueron omitidos o truncados por límites de seguridad"
      : undefined,
  }
}

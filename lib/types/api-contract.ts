/**
 * Tipos según el contrato API v1
 * ControlFile – Repository Chat API
 * Backend = única fuente de verdad · Frontend pasivo
 */

// ============================================
// POST /repositories/index
// ============================================

export interface IndexRepositoryRequest {
  repositoryId: string // "github:owner:repo"
  accessToken?: string // opcional (solo repos privados)
  force?: boolean // fuerza reindexación
}

export interface IndexRepositoryResponse {
  repositoryId: string
  status: "indexing" | "completed" | "error"
  message: string
}

// ============================================
// GET /repositories/{repositoryId}/status
// ============================================

export interface RepositoryStatusResponse {
  repositoryId: string
  status: "idle" | "indexing" | "completed" | "error"
  indexedAt?: string // ISO 8601
  stats?: {
    totalFiles: number
    totalSize: number
    languages: string[]
  }
  error: string | null
}

// ============================================
// POST /chat/query
// ============================================

export interface ChatQueryRequest {
  repositoryId: string
  question: string
  conversationId?: string
}

export interface ChatQueryResponseSuccess {
  response: string
  conversationId: string
  sources: Array<{
    path: string
    lines: [number, number]
  }>
  debug?: {
    engine?: string
    model?: string
    location?: string
  }
}

export interface ChatQueryResponseIndexing {
  status: "indexing"
  message: string
}

export interface ChatQueryResponseNotReady {
  status: "idle" | "error"
  message: string
}

export type ChatQueryResponse =
  | ChatQueryResponseSuccess
  | ChatQueryResponseIndexing
  | ChatQueryResponseNotReady

// ============================================
// GET /chat/status
// ============================================

export interface LLMStatusResponse {
  ok: boolean
  provider?: string // ej: "ollama"
  model?: string // ej: "llama3"
  error?: string
}

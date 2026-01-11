/**
 * Tipos para el endpoint interno /internal/llm/query
 * ControlFile → ControlRepo
 */

import type { IndexedFile, RepositoryIndex } from "./repository"
import type { ProjectBrain } from "./project-brain"
import type { RepositoryMetrics } from "./repository-metrics"

/**
 * Request del endpoint interno
 */
export interface InternalLLMQueryRequest {
  // Datos de la consulta
  question: string // REQUERIDO: Pregunta del usuario
  repositoryId: string // REQUERIDO: ID del repositorio (github:owner:repo)
  
  // Contexto de conversación
  conversationMemory?: Array<{ // OPCIONAL: Historial de conversación
    role: "user" | "assistant"
    content: string
    timestamp: string
  }>
  
  // Rol del asistente (afecta el tipo de respuesta)
  role?: "architecture-explainer" | "structure-auditor" // OPCIONAL: Default "architecture-explainer"
  
  // Contexto completo del repositorio
  context: {
    index: RepositoryIndex // REQUERIDO: Índice completo del repositorio
    projectBrain?: ProjectBrain // OPCIONAL: Project Brain si existe
    metrics?: RepositoryMetrics // OPCIONAL: Métricas si existen
  }
  
  // Opciones de ejecución
  options?: {
    engine?: "ollama" | "cloud" // OPCIONAL: Preferencia de motor
    model?: string // OPCIONAL: Modelo específico (ej: "phi3:mini")
    temperature?: number // OPCIONAL: Default 0.7
    maxTokens?: number // OPCIONAL: Límite de tokens
    includeDebug?: boolean // OPCIONAL: Incluir info de debug
  }
}

/**
 * Response del endpoint interno
 */
export interface InternalLLMQueryResponse {
  // Respuesta principal
  answer: string // REQUERIDO: Respuesta generada por el LLM
  
  // Archivos citados en la respuesta
  files: Array<{ // REQUERIDO: Archivos relevantes encontrados
    path: string
    name: string
    lines?: [number, number] // OPCIONAL: Rango de líneas relevantes [start, end]
    relevance?: number // OPCIONAL: Score de relevancia (0-1)
  }>
  
  // Hallazgos estructurados
  findings?: { // OPCIONAL: Hallazgos encontrados
    improvements: string[]
    risks: string[]
  }
  
  // Información de debug (solo si includeDebug: true)
  debug?: {
    engine: "ollama" | "cloud"
    model: string
    location: "local" | "cloud"
    latency: number // Segundos
    tokensUsed?: number // OPCIONAL: Tokens usados
    retrievalTime?: number // OPCIONAL: Tiempo de RAG
    generationTime?: number // OPCIONAL: Tiempo de generación
  }
  
  // Metadata
  timestamp: string // ISO 8601
}

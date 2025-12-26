/**
 * Tipos para flows.json
 * Schema para flujos del sistema generados por análisis del repositorio
 */

export interface Flow {
  id: string
  name: string
  description: string
  steps: FlowStep[]
  triggers?: FlowTrigger[]
  actors?: string[] // Entidades que participan (usuario, sistema, API, etc.)
  relatedFiles?: string[] // Paths de archivos relacionados con este flujo
}

export interface FlowStep {
  step: number // Número de paso (1, 2, 3...)
  name: string
  description: string
  actor?: string // Quién ejecuta este paso
  action: string // Qué acción se realiza
  nextSteps?: number[] // Números de pasos siguientes
  conditions?: string[] // Condiciones para avanzar
  relatedFiles?: string[] // Paths de archivos relacionados con este paso
}

export interface FlowTrigger {
  actor: "user" | "system"
  action: string
  source?: string // Origen del trigger (ej: "button click", "API call", "scheduled event")
}

export interface RepositoryFlows {
  // Metadatos del archivo
  version: number // Versión del schema (iniciar en 1)
  schema: string // "repository-flows-v1"
  generatedAt: string // ISO 8601
  indexCommit: string // SHA del commit indexado
  repositoryId: string // "owner/repo"
  
  // Flujos identificados (puede estar vacío si no se detectaron flujos claros)
  flows: Flow[]
  
  // Metadatos adicionales
  metadata?: {
    totalFlows: number
    mainFlows?: string[] // IDs de flujos principales
    categories?: string[] // Categorías de flujos (ej: "autenticación", "navegación", "consulta")
    notes?: string // Notas sobre la generación (ej: "No se detectaron flujos explícitos")
  }
}


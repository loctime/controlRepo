/**
 * Tipos para Project Brain
 * 
 * El Project Brain es conocimiento acumulado sobre el repositorio.
 * Pertenece al repositorio, no a conversaciones individuales.
 * Se construye gradualmente a partir de insights arquitectónicos.
 */

export interface ProjectBrain {
  // Identificación
  repositoryId: string // "owner/repo"
  
  // Timestamps
  createdAt: string // ISO 8601
  updatedAt: string // ISO 8601
  lastAnalyzedAt?: string // ISO 8601 - última vez que se analizó el repositorio
  
  // Arquitectura del proyecto
  architecture: {
    // Descripción general de la arquitectura
    overview?: string
    
    // Patrones identificados
    patterns: ArchitecturePattern[]
    
    // Decisiones de diseño documentadas
    decisions: DesignDecision[]
    
    // Capas del sistema identificadas
    layers?: SystemLayer[]
  }
  
  // Insights acumulados
  insights: {
    // Insights sobre estructura
    structure: Insight[]
    
    // Insights sobre código
    code: Insight[]
    
    // Insights sobre dependencias
    dependencies: Insight[]
    
    // Insights sobre organización
    organization: Insight[]
  }
  
  // Contexto global del proyecto
  context: {
    // Propósito del proyecto
    purpose?: string
    
    // Tecnologías principales
    technologies: string[]
    
    // Convenciones identificadas
    conventions: Convention[]
    
    // Áreas de atención (áreas que requieren cuidado especial)
    areasOfConcern: string[]
  }
  
  // Estadísticas de análisis
  stats: {
    totalInsights: number
    totalDecisions: number
    totalPatterns: number
    lastAnalysisDuration?: number // en milisegundos
  }
}

export interface ArchitecturePattern {
  id: string
  name: string
  description: string
  examples: string[] // Paths de archivos que ejemplifican el patrón
  identifiedAt: string // ISO 8601
  confidence: "low" | "medium" | "high" // Confianza en la identificación del patrón
}

export interface DesignDecision {
  id: string
  title: string
  description: string
  rationale?: string // Razón detrás de la decisión
  alternatives?: string[] // Alternativas consideradas
  affectedFiles: string[] // Paths de archivos afectados por esta decisión
  documentedAt: string // ISO 8601
  source?: string // Fuente: "conversation", "code-analysis", "documentation"
}

export interface SystemLayer {
  id: string
  name: string
  description: string
  files: string[] // Paths de archivos en esta capa
  responsibilities: string[]
}

export interface Insight {
  id: string
  type: "structure" | "code" | "dependencies" | "organization"
  title: string
  description: string
  relatedFiles: string[] // Paths de archivos relacionados
  discoveredAt: string // ISO 8601
  confidence: "low" | "medium" | "high"
  tags: string[]
}

export interface Convention {
  id: string
  name: string
  description: string
  examples: string[] // Paths de archivos que ejemplifican la convención
  identifiedAt: string // ISO 8601
}


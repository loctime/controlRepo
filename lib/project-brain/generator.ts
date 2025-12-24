/**
 * Generador de Project Brain mínimo
 * Genera solo la estructura básica sin inferir decisiones ni leer conversaciones
 */

import { RepositoryIndex } from "@/lib/types/repository"
import { ProjectBrain } from "@/lib/types/project-brain"

/**
 * Genera un Project Brain mínimo a partir de un RepositoryIndex
 * Solo incluye: repositoryId, createdAt, summary básico (totalFiles, mainLanguages)
 */
export function generateMinimalProjectBrain(index: RepositoryIndex): ProjectBrain {
  const now = new Date().toISOString()
  
  // Extraer lenguajes principales (top 3)
  const mainLanguages = Object.entries(index.summary.languages)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 3)
    .map(([lang]) => lang)

  return {
    repositoryId: index.id,
    createdAt: now,
    updatedAt: now,
    architecture: {
      patterns: [],
      decisions: [],
    },
    insights: {
      structure: [],
      code: [],
      dependencies: [],
      organization: [],
    },
    context: {
      technologies: mainLanguages,
      conventions: [],
      areasOfConcern: [],
    },
    stats: {
      totalInsights: 0,
      totalDecisions: 0,
      totalPatterns: 0,
    },
  }
}


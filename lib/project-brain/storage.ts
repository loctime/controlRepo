/**
 * Interfaz de persistencia de Project Brain
 * 
 * El Project Brain pertenece al repositorio, no a conversaciones individuales.
 * Se almacena en storage interno de ControlRepo.
 */

import { ProjectBrain } from "@/lib/types/project-brain"

export interface ProjectBrainStorage {
  /**
   * Guarda o actualiza el Project Brain de un repositorio
   */
  saveProjectBrain(brain: ProjectBrain): Promise<void>
  
  /**
   * Obtiene el Project Brain de un repositorio
   */
  getProjectBrain(repositoryId: string): Promise<ProjectBrain | null>
  
  /**
   * Verifica si existe un Project Brain para un repositorio
   */
  hasProjectBrain(repositoryId: string): Promise<boolean>
  
  /**
   * Elimina el Project Brain de un repositorio
   */
  deleteProjectBrain(repositoryId: string): Promise<void>
}

// Exportar implementación filesystem por defecto
export * from "./storage-filesystem"


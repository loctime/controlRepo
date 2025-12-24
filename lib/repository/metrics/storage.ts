/**
 * Interfaz de persistencia de Repository Metrics
 * 
 * Las métricas pertenecen al repositorio, no a conversaciones individuales.
 * Se almacenan en storage interno de ControlRepo.
 */

import { RepositoryMetrics } from "@/lib/types/repository-metrics"

export interface RepositoryMetricsStorage {
  /**
   * Guarda o actualiza las métricas de un repositorio
   */
  saveMetrics(repositoryId: string, metrics: RepositoryMetrics): Promise<void>
  
  /**
   * Obtiene las métricas de un repositorio
   */
  getMetrics(repositoryId: string): Promise<RepositoryMetrics | null>
  
  /**
   * Verifica si existen métricas para un repositorio
   */
  hasMetrics(repositoryId: string): Promise<boolean>
  
  /**
   * Elimina las métricas de un repositorio
   */
  deleteMetrics(repositoryId: string): Promise<void>
}

// Exportar implementación filesystem por defecto
export * from "./storage-filesystem"


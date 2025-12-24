/**
 * Interfaz de persistencia de métricas de repositorio
 * 
 * Las métricas pertenecen al repositorio y se almacenan junto con el índice
 */

import { RepositoryMetrics } from "@/lib/types/repository-metrics"

export interface MetricsStorage {
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

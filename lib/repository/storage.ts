/**
 * Interfaz de persistencia de índices de repositorio
 * Permite diferentes implementaciones (filesystem, Firestore, etc.)
 */

import { RepositoryIndex, IndexLock } from "@/lib/types/repository"

export interface RepositoryStorage {
  saveRepositoryIndex(index: RepositoryIndex): Promise<void>
  getRepositoryIndex(repositoryId: string): Promise<RepositoryIndex | null>
  acquireIndexLock(repositoryId: string, lockedBy?: string): Promise<boolean>
  releaseIndexLock(repositoryId: string): Promise<void>
  isIndexing(repositoryId: string): Promise<boolean>
}

// Exportar implementación filesystem-based por defecto
export * from "./storage-filesystem"

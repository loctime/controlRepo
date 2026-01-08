/**
 * Persistencia de índices de repositorio usando sistema de archivos
 * Implementación filesystem-based para producción
 * 
 * Características:
 * - Escritura atómica (archivos temporales + rename)
 * - Locking robusto con eliminación real de archivos
 * - Detección de locks expirados incluso si el proceso murió
 */

import { RepositoryIndex, IndexLock } from "@/lib/types/repository"
import { writeFile, readFile, mkdir, unlink, rename, stat, readdir } from "fs/promises"
import { join } from "path"
import { RepositoryStorage } from "./storage"
import { normalizeRepositoryIdForFile } from "./utils"

const STORAGE_DIR = join(process.cwd(), ".repository-indexes")
const LOCK_DIR = join(process.cwd(), ".repository-locks")

// Asegurar que los directorios existan
async function ensureDirs() {
  try {
    await mkdir(STORAGE_DIR, { recursive: true })
    await mkdir(LOCK_DIR, { recursive: true })
  } catch (error) {
    // Ignorar si ya existen
  }
}

/**
 * Implementación filesystem-based de RepositoryStorage
 */
class FilesystemRepositoryStorage implements RepositoryStorage {
  /**
   * Guarda un índice de repositorio de forma atómica
   * Escribe primero a un archivo temporal (.tmp) y luego renombra al archivo final
   */
  async saveRepositoryIndex(index: RepositoryIndex): Promise<void> {
    await ensureDirs()
    const fileName = `${normalizeRepositoryIdForFile(index.id)}.json`
    const finalPath = join(STORAGE_DIR, fileName)
    const tempPath = join(STORAGE_DIR, `${fileName}.tmp`)

    try {
      // Escribir a archivo temporal
      const content = JSON.stringify(index, null, 2)
      await writeFile(tempPath, content, "utf-8")

      // Renombrar atómicamente al archivo final
      await rename(tempPath, finalPath)
    } catch (error) {
      // Limpiar archivo temporal si hay error
      try {
        await unlink(tempPath).catch(() => {})
      } catch {
        // Ignorar errores de limpieza
      }
      throw error
    }
  }

  /**
   * Obtiene un índice de repositorio
   * Busca en múltiples formatos para compatibilidad:
   * 1. Formato backend: github:owner:repo -> github_owner_repo.json
   * 2. Formato local: owner/repo/branch -> owner_repo_branch.json
   */
  async getRepositoryIndex(repositoryId: string): Promise<RepositoryIndex | null> {
    await ensureDirs()
    
    // PASO 1: Intentar con el formato exacto del repositoryId (normalizado)
    try {
      const normalized = normalizeRepositoryIdForFile(repositoryId)
      const filePath = join(STORAGE_DIR, `${normalized}.json`)
      const content = await readFile(filePath, "utf-8")
      const index = JSON.parse(content) as RepositoryIndex
      if (index && index.id) {
        return index
      }
    } catch (error: any) {
      // Archivo no existe o error de lectura, continuar
      if (error?.code !== "ENOENT") {
        console.log(`[getRepositoryIndex] Error al leer índice en formato directo: ${error instanceof Error ? error.message : "Error desconocido"}`)
      }
    }
    
    // PASO 2: Si es formato github:owner:repo, parsear y buscar formatos alternativos
    if (repositoryId.startsWith("github:")) {
      const parts = repositoryId.replace("github:", "").split(":")
      if (parts.length === 2) {
        const [owner, repo] = parts
        
        // Intentar formato backend: github_owner_repo.json
        try {
          const backendFormat = normalizeRepositoryIdForFile(repositoryId)
          const filePath = join(STORAGE_DIR, `${backendFormat}.json`)
          const content = await readFile(filePath, "utf-8")
          const index = JSON.parse(content) as RepositoryIndex
          if (index && index.id) {
            return index
          }
        } catch (error: any) {
          if (error?.code !== "ENOENT") {
            console.log(`[getRepositoryIndex] Error al leer índice en formato backend: ${error instanceof Error ? error.message : "Error desconocido"}`)
          }
        }
        
        // Intentar buscar archivos que coincidan con el patrón owner_repo_*
        try {
          const prefix = normalizeRepositoryIdForFile(`${owner}/${repo}/`)
          const files = await readdir(STORAGE_DIR)
          const matchingFiles = files.filter(file => 
            file.startsWith(prefix) && file.endsWith(".json")
          )
          
          // Intentar leer el primer archivo que coincida
          for (const file of matchingFiles) {
            try {
              const filePath = join(STORAGE_DIR, file)
              const content = await readFile(filePath, "utf-8")
              const index = JSON.parse(content) as RepositoryIndex
              if (index && index.id) {
                return index
              }
            } catch (error) {
              continue
            }
          }
        } catch (error) {
          // Si hay error al leer el directorio, continuar
        }
      }
    }
    
    return null
  }

  /**
   * Adquiere un lock para indexación
   * Retorna true si el lock fue adquirido, false si ya está bloqueado
   */
  async acquireIndexLock(repositoryId: string, lockedBy: string = "system"): Promise<boolean> {
    await ensureDirs()
    const lockPath = join(LOCK_DIR, `${normalizeRepositoryIdForFile(repositoryId)}.json`)

    try {
      // Verificar si existe un lock activo
      const lockContent = await readFile(lockPath, "utf-8")
      if (!lockContent.trim()) {
        // Archivo vacío, eliminarlo y continuar
        await unlink(lockPath).catch(() => {})
      } else {
        const lock: IndexLock = JSON.parse(lockContent)
        const now = new Date()
        const expiresAt = new Date(lock.expiresAt)

        // Si el lock expiró, eliminarlo
        if (now > expiresAt) {
          await unlink(lockPath).catch(() => {})
        } else {
          // Lock activo
          return false
        }
      }
    } catch (error: any) {
      // Si el archivo no existe (ENOENT), continuar para crear el lock
      if (error?.code !== "ENOENT") {
        // Otro error, intentar eliminar el archivo corrupto
        await unlink(lockPath).catch(() => {})
      }
    }

    // Crear nuevo lock (expira en 30 minutos)
    const expiresAt = new Date()
    expiresAt.setMinutes(expiresAt.getMinutes() + 30)

    const lock: IndexLock = {
      repositoryId,
      lockedAt: new Date().toISOString(),
      lockedBy,
      expiresAt: expiresAt.toISOString(),
    }

    await writeFile(lockPath, JSON.stringify(lock, null, 2), "utf-8")
    return true
  }

  /**
   * Libera un lock de indexación eliminando el archivo
   */
  async releaseIndexLock(repositoryId: string): Promise<void> {
    await ensureDirs()
    const lockPath = join(LOCK_DIR, `${normalizeRepositoryIdForFile(repositoryId)}.json`)
    
    try {
      await unlink(lockPath)
    } catch (error: any) {
      // Ignorar si el archivo no existe (ENOENT)
      if (error?.code !== "ENOENT") {
        // Re-lanzar otros errores para logging
        console.error(`Error al liberar lock ${repositoryId}:`, error)
      }
    }
  }

  /**
   * Verifica si un repositorio está siendo indexado
   * Maneja correctamente locks expirados incluso si el proceso murió
   */
  async isIndexing(repositoryId: string): Promise<boolean> {
    await ensureDirs()
    const lockPath = join(LOCK_DIR, `${normalizeRepositoryIdForFile(repositoryId)}.json`)

    try {
      // Verificar si el archivo existe
      await stat(lockPath)
      
      const lockContent = await readFile(lockPath, "utf-8")
      if (!lockContent.trim()) {
        // Archivo vacío, no está indexando
        await unlink(lockPath).catch(() => {})
        return false
      }

      const lock: IndexLock = JSON.parse(lockContent)
      const now = new Date()
      const expiresAt = new Date(lock.expiresAt)

      if (now > expiresAt) {
        // Lock expirado, eliminarlo
        await unlink(lockPath).catch(() => {})
        return false
      }

      return true
    } catch (error: any) {
      // Archivo no existe o error de lectura
      if (error?.code === "ENOENT") {
        return false
      }
      // Otro error, asumir que no está indexando
      console.error(`Error al verificar lock ${repositoryId}:`, error)
      return false
    }
  }
}

// Exportar instancia singleton
export const filesystemStorage = new FilesystemRepositoryStorage()

// Exportar funciones de conveniencia que usan la instancia
export async function saveRepositoryIndex(index: RepositoryIndex): Promise<void> {
  return filesystemStorage.saveRepositoryIndex(index)
}

export async function getRepositoryIndex(repositoryId: string): Promise<RepositoryIndex | null> {
  return filesystemStorage.getRepositoryIndex(repositoryId)
}

export async function acquireIndexLock(
  repositoryId: string,
  lockedBy: string = "system"
): Promise<boolean> {
  return filesystemStorage.acquireIndexLock(repositoryId, lockedBy)
}

export async function releaseIndexLock(repositoryId: string): Promise<void> {
  return filesystemStorage.releaseIndexLock(repositoryId)
}

export async function isIndexing(repositoryId: string): Promise<boolean> {
  return filesystemStorage.isIndexing(repositoryId)
}


/**
 * Persistencia de Project Brain usando sistema de archivos
 * Usa el mismo directorio base que los índices de repositorio
 */

import { ProjectBrain } from "@/lib/types/project-brain"
import { writeFile, readFile, mkdir, unlink, rename } from "fs/promises"
import { join } from "path"
import { ProjectBrainStorage } from "./storage"

// Usar el mismo directorio base que los índices de repositorio
const STORAGE_DIR = join(process.cwd(), ".repository-indexes")

// Asegurar que el directorio exista
async function ensureDirs() {
  try {
    await mkdir(STORAGE_DIR, { recursive: true })
  } catch (error) {
    // Ignorar si ya existe
  }
}

/**
 * Implementación filesystem-based de ProjectBrainStorage
 */
class FilesystemProjectBrainStorage implements ProjectBrainStorage {
  /**
   * Obtiene la ruta del directorio del Project Brain para un repositorio
   */
  private getBrainDir(repositoryId: string): string {
    const normalizedId = repositoryId.replace("/", "_")
    return join(STORAGE_DIR, normalizedId)
  }

  /**
   * Obtiene la ruta del archivo Project Brain
   */
  private getBrainPath(repositoryId: string): string {
    return join(this.getBrainDir(repositoryId), "project-brain.json")
  }

  /**
   * Guarda o actualiza el Project Brain de un repositorio
   */
  async saveProjectBrain(brain: ProjectBrain): Promise<void> {
    await ensureDirs()
    const brainDir = this.getBrainDir(brain.repositoryId)
    const finalPath = this.getBrainPath(brain.repositoryId)
    const tempPath = join(brainDir, "project-brain.json.tmp")

    try {
      // Asegurar que el directorio del repositorio exista
      await mkdir(brainDir, { recursive: true })

      // Escribir a archivo temporal
      const content = JSON.stringify(brain, null, 2)
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
   * Obtiene el Project Brain de un repositorio
   */
  async getProjectBrain(repositoryId: string): Promise<ProjectBrain | null> {
    await ensureDirs()
    const filePath = this.getBrainPath(repositoryId)

    try {
      const content = await readFile(filePath, "utf-8")
      return JSON.parse(content) as ProjectBrain
    } catch (error) {
      return null
    }
  }

  /**
   * Verifica si existe un Project Brain para un repositorio
   */
  async hasProjectBrain(repositoryId: string): Promise<boolean> {
    const brain = await this.getProjectBrain(repositoryId)
    return brain !== null
  }

  /**
   * Elimina el Project Brain de un repositorio
   */
  async deleteProjectBrain(repositoryId: string): Promise<void> {
    await ensureDirs()
    const filePath = this.getBrainPath(repositoryId)

    try {
      await unlink(filePath)
    } catch (error: any) {
      // Ignorar si el archivo no existe (ENOENT)
      if (error?.code !== "ENOENT") {
        throw error
      }
    }
  }
}

// Exportar instancia singleton
export const filesystemProjectBrainStorage = new FilesystemProjectBrainStorage()

// Exportar funciones de conveniencia que usan la instancia
export async function saveProjectBrain(brain: ProjectBrain): Promise<void> {
  return filesystemProjectBrainStorage.saveProjectBrain(brain)
}

export async function getProjectBrain(repositoryId: string): Promise<ProjectBrain | null> {
  return filesystemProjectBrainStorage.getProjectBrain(repositoryId)
}

export async function hasProjectBrain(repositoryId: string): Promise<boolean> {
  return filesystemProjectBrainStorage.hasProjectBrain(repositoryId)
}

export async function deleteProjectBrain(repositoryId: string): Promise<void> {
  return filesystemProjectBrainStorage.deleteProjectBrain(repositoryId)
}


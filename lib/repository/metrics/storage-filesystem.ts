/**
 * Persistencia de métricas usando sistema de archivos
 * Usa el mismo directorio base que los índices de repositorio
 */

import { RepositoryMetrics } from "@/lib/types/repository-metrics"
import { writeFile, readFile, mkdir, unlink, rename } from "fs/promises"
import { join } from "path"
import { MetricsStorage } from "./storage"

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
 * Normaliza un repositoryId para uso seguro en filesystem
 * Reemplaza caracteres no seguros con guiones bajos
 */
function normalizeRepositoryId(repositoryId: string): string {
  // Reemplazar slashes y otros caracteres no seguros con guiones bajos
  return repositoryId.replace(/[^a-zA-Z0-9._-]/g, "_")
}

/**
 * Implementación filesystem-based de MetricsStorage
 */
class FilesystemMetricsStorage implements MetricsStorage {
  /**
   * Obtiene la ruta del directorio de métricas para un repositorio
   */
  private getMetricsDir(repositoryId: string): string {
    const normalizedId = normalizeRepositoryId(repositoryId)
    return join(STORAGE_DIR, normalizedId)
  }

  /**
   * Obtiene la ruta del archivo de métricas
   */
  private getMetricsPath(repositoryId: string): string {
    return join(this.getMetricsDir(repositoryId), "metrics.json")
  }

  /**
   * Guarda o actualiza las métricas de un repositorio
   */
  async saveMetrics(repositoryId: string, metrics: RepositoryMetrics): Promise<void> {
    await ensureDirs()
    const metricsDir = this.getMetricsDir(repositoryId)
    const finalPath = this.getMetricsPath(repositoryId)
    const tempPath = join(metricsDir, "metrics.json.tmp")

    try {
      // Asegurar que el directorio del repositorio exista
      await mkdir(metricsDir, { recursive: true })

      // Escribir a archivo temporal
      const content = JSON.stringify(metrics, null, 2)
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
   * Obtiene las métricas de un repositorio
   */
  async getMetrics(repositoryId: string): Promise<RepositoryMetrics | null> {
    await ensureDirs()
    const filePath = this.getMetricsPath(repositoryId)

    try {
      const content = await readFile(filePath, "utf-8")
      return JSON.parse(content) as RepositoryMetrics
    } catch (error) {
      return null
    }
  }

  /**
   * Verifica si existen métricas para un repositorio
   */
  async hasMetrics(repositoryId: string): Promise<boolean> {
    const metrics = await this.getMetrics(repositoryId)
    return metrics !== null
  }

  /**
   * Elimina las métricas de un repositorio
   */
  async deleteMetrics(repositoryId: string): Promise<void> {
    await ensureDirs()
    const filePath = this.getMetricsPath(repositoryId)

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
export const filesystemMetricsStorage = new FilesystemMetricsStorage()

// Exportar funciones de conveniencia que usan la instancia
export async function saveMetrics(repositoryId: string, metrics: RepositoryMetrics): Promise<void> {
  return filesystemMetricsStorage.saveMetrics(repositoryId, metrics)
}

export async function getMetrics(repositoryId: string): Promise<RepositoryMetrics | null> {
  return filesystemMetricsStorage.getMetrics(repositoryId)
}

export async function hasMetrics(repositoryId: string): Promise<boolean> {
  return filesystemMetricsStorage.hasMetrics(repositoryId)
}

export async function deleteMetrics(repositoryId: string): Promise<void> {
  return filesystemMetricsStorage.deleteMetrics(repositoryId)
}

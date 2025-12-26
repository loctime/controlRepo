/**
 * Persistencia de flows.json usando sistema de archivos
 * Usa directorio .repository-analysis separado del indexado
 */

import { RepositoryFlows } from "@/lib/types/flows"
import { writeFile, readFile, mkdir, unlink, rename } from "fs/promises"
import { join } from "path"

// Directorio separado para análisis del repositorio
const STORAGE_DIR = join(process.cwd(), ".repository-analysis")

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
 */
function normalizeRepositoryId(repositoryId: string): string {
  return repositoryId.replace(/[^a-zA-Z0-9._-]/g, "_")
}

/**
 * Obtiene la ruta del directorio de flows para un repositorio
 */
function getFlowsDir(repositoryId: string): string {
  const normalizedId = normalizeRepositoryId(repositoryId)
  return join(STORAGE_DIR, normalizedId)
}

/**
 * Obtiene la ruta del archivo flows.json
 */
function getFlowsPath(repositoryId: string): string {
  return join(getFlowsDir(repositoryId), "flows.json")
}

/**
 * Guarda o actualiza flows.json de un repositorio
 */
export async function saveFlows(repositoryId: string, flows: RepositoryFlows): Promise<void> {
  await ensureDirs()
  const flowsDir = getFlowsDir(repositoryId)
  const finalPath = getFlowsPath(repositoryId)
  const tempPath = join(flowsDir, "flows.json.tmp")

  try {
    // Asegurar que el directorio del repositorio exista
    await mkdir(flowsDir, { recursive: true })

    // Escribir a archivo temporal
    const content = JSON.stringify(flows, null, 2)
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
 * Obtiene flows.json de un repositorio
 */
export async function getFlows(repositoryId: string): Promise<RepositoryFlows | null> {
  await ensureDirs()
  const filePath = getFlowsPath(repositoryId)

  try {
    const content = await readFile(filePath, "utf-8")
    return JSON.parse(content) as RepositoryFlows
  } catch (error) {
    return null
  }
}

/**
 * Verifica si existen flows para un repositorio
 */
export async function hasFlows(repositoryId: string): Promise<boolean> {
  const flows = await getFlows(repositoryId)
  return flows !== null
}

/**
 * Elimina flows.json de un repositorio
 */
export async function deleteFlows(repositoryId: string): Promise<void> {
  await ensureDirs()
  const filePath = getFlowsPath(repositoryId)

  try {
    await unlink(filePath)
  } catch (error: any) {
    // Ignorar si el archivo no existe (ENOENT)
    if (error?.code !== "ENOENT") {
      throw error
    }
  }
}


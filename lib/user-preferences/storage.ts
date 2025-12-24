/**
 * Persistencia de preferencias de usuario usando sistema de archivos
 * Almacena el repositorio activo por usuario
 */

import { writeFile, readFile, mkdir, unlink, rename } from "fs/promises"
import { join } from "path"

const STORAGE_DIR = join(process.cwd(), ".user-preferences")

export interface UserPreferences {
  userId: string
  activeRepositoryId: string | null
  updatedAt: string
}

// Asegurar que el directorio exista
async function ensureDir() {
  try {
    await mkdir(STORAGE_DIR, { recursive: true })
  } catch (error) {
    // Ignorar si ya existe
  }
}

/**
 * Obtiene las preferencias de un usuario
 */
export async function getUserPreferences(userId: string): Promise<UserPreferences | null> {
  await ensureDir()
  const filePath = join(STORAGE_DIR, `${userId}.json`)

  try {
    const content = await readFile(filePath, "utf-8")
    return JSON.parse(content) as UserPreferences
  } catch (error: any) {
    // Si el archivo no existe, retornar null
    if (error?.code === "ENOENT") {
      return null
    }
    // Otro error, retornar null también
    console.error(`Error al leer preferencias de usuario ${userId}:`, error)
    return null
  }
}

/**
 * Guarda las preferencias de un usuario
 */
export async function saveUserPreferences(preferences: UserPreferences): Promise<void> {
  await ensureDir()
  const filePath = join(STORAGE_DIR, `${preferences.userId}.json`)
  const tempPath = join(STORAGE_DIR, `${preferences.userId}.json.tmp`)

  try {
    // Escribir a archivo temporal primero
    const content = JSON.stringify(preferences, null, 2)
    await writeFile(tempPath, content, "utf-8")

    // Renombrar atómicamente al archivo final
    await rename(tempPath, filePath)
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
 * Actualiza el repositorio activo de un usuario
 */
export async function updateActiveRepository(userId: string, repositoryId: string | null): Promise<void> {
  const existing = await getUserPreferences(userId)
  
  const preferences: UserPreferences = {
    userId,
    activeRepositoryId: repositoryId,
    updatedAt: new Date().toISOString(),
  }

  await saveUserPreferences(preferences)
}


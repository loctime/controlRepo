/**
 * Función de búsqueda de archivos indexados
 * Función pura exportable para uso en backend y frontend
 */

import { IndexedFile } from "@/lib/types/repository"

/**
 * Busca archivos por query (busca en nombre, path, tags y descripción)
 * Función pura exportable para uso en backend y frontend
 */
export function searchFiles(files: IndexedFile[], query: string): IndexedFile[] {
  if (!files || files.length === 0 || !query.trim()) {
    return []
  }

  const lowerQuery = query.toLowerCase().trim()

  return files.filter((file) => {
    // Buscar en nombre
    if (file.name.toLowerCase().includes(lowerQuery)) return true

    // Buscar en path
    if (file.path.toLowerCase().includes(lowerQuery)) return true

    // Buscar en tags
    if (file.tags.some((tag) => tag.toLowerCase().includes(lowerQuery))) return true

    // Buscar en descripción
    if (file.summary.description?.toLowerCase().includes(lowerQuery)) return true

    // Buscar en exports
    if (file.summary.exports?.some((exp) => exp.toLowerCase().includes(lowerQuery))) return true

    return false
  })
}







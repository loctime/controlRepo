/**
 * Generador de métricas de repositorio
 * Procesa un RepositoryIndex y genera métricas estructuradas
 */

import { RepositoryIndex } from "@/lib/types/repository"
import { ProjectBrain } from "@/lib/types/project-brain"
import { RepositoryMetrics } from "@/lib/types/repository-metrics"
import path from "path"

/**
 * Normaliza un path a formato Unix con / final si es directorio
 * Asegura paths relativos sin dependencia del OS
 */
function normalizeFolderPath(filePath: string): string {
  // Normalizar separadores a /
  let normalized = filePath.replace(/\\/g, "/")
  
  // Remover leading slash si existe (para paths relativos)
  if (normalized.startsWith("/")) {
    normalized = normalized.substring(1)
  }
  
  // Obtener directorio usando path.posix
  const dir = path.posix.dirname(normalized)
  
  // Si el directorio es "." significa que está en la raíz
  // Retornar string vacío para raíz, o el directorio con / final
  if (dir === "." || dir === "/") {
    return ""
  }
  
  // Asegurar que termine con /
  return dir.endsWith("/") ? dir : `${dir}/`
}

/**
 * Obtiene la extensión de un archivo
 */
function getFileExtension(filePath: string): string {
  const ext = path.posix.extname(filePath)
  return ext || ""
}

/**
 * Detecta si un archivo es un entrypoint basado en su nombre
 */
function isEntrypointByFilename(fileName: string): boolean {
  const lowerName = fileName.toLowerCase()
  return (
    lowerName === "index.ts" ||
    lowerName === "index.js" ||
    lowerName === "index.tsx" ||
    lowerName === "index.jsx" ||
    lowerName === "main.ts" ||
    lowerName === "main.js"
  )
}

/**
 * Detecta si un archivo es un entrypoint basado en su ubicación
 */
function isEntrypointByLocation(filePath: string): boolean {
  // Normalizar separadores y remover leading slash si existe
  let normalized = filePath.replace(/\\/g, "/")
  if (normalized.startsWith("/")) {
    normalized = normalized.substring(1)
  }
  
  const lowerPath = normalized.toLowerCase()
  
  return (
    lowerPath === "app/page.tsx" ||
    lowerPath === "app/page.jsx" ||
    lowerPath === "src/index.ts" ||
    lowerPath === "src/index.js" ||
    lowerPath === "src/main.ts" ||
    lowerPath === "src/main.js" ||
    lowerPath === "index.ts" ||
    lowerPath === "index.js" ||
    lowerPath === "main.ts" ||
    lowerPath === "main.js"
  )
}

/**
 * Genera métricas a partir de un RepositoryIndex
 * @param index El índice del repositorio
 * @param projectBrain Opcional - ProjectBrain del repositorio (no usado en MVP pero incluido para compatibilidad futura)
 */
export function generateMetrics(
  index: RepositoryIndex,
  projectBrain?: ProjectBrain
): RepositoryMetrics {
  const now = new Date().toISOString()

  // Agrupación por carpetas
  const folderMap = new Map<string, { files: number; lines: number }>()
  
  // Agrupación por extensión
  const languageMap = new Map<string, { files: number; lines: number }>()
  
  // Contadores para relaciones
  const importedByCountMap = new Map<string, number>()
  const importsCountMap = new Map<string, number>()
  
  // Entrypoints detectados
  const entrypoints: Array<{ path: string; reason: "filename" | "location" | "config" }> = []

  // Procesar cada archivo
  for (const file of index.files) {
    // Agrupación por carpetas
    const folderPath = normalizeFolderPath(file.path)
    if (folderPath) {
      const folder = folderMap.get(folderPath) || { files: 0, lines: 0 }
      folder.files++
      folder.lines += file.lines
      folderMap.set(folderPath, folder)
    }

    // Agrupación por extensión
    const ext = getFileExtension(file.path)
    if (ext) {
      const lang = languageMap.get(ext) || { files: 0, lines: 0 }
      lang.files++
      lang.lines += file.lines
      languageMap.set(ext, lang)
    }

    // Contar imports
    const importsCount = file.relations.imports.length
    if (importsCount > 0) {
      importsCountMap.set(file.path, importsCount)
    }

    // Contar importedBy
    const importedByCount = file.relations.importedBy.length
    if (importedByCount > 0) {
      importedByCountMap.set(file.path, importedByCount)
    }

    // Detectar entrypoints
    const fileName = path.posix.basename(file.path)
    
    if (isEntrypointByFilename(fileName)) {
      entrypoints.push({
        path: file.path,
        reason: "filename",
      })
    } else if (isEntrypointByLocation(file.path)) {
      // Evitar duplicados si ya fue detectado por filename
      if (!entrypoints.some((ep) => ep.path === file.path)) {
        entrypoints.push({
          path: file.path,
          reason: "location",
        })
      }
    }
    // Nota: "config" no se implementa en MVP según el plan
  }

  // Convertir carpetas a array y filtrar (solo carpetas con al menos 2 archivos)
  const folders = Array.from(folderMap.entries())
    .filter(([, stats]) => stats.files >= 2)
    .map(([folderPath, stats]) => ({
      path: folderPath,
      files: stats.files,
      lines: stats.lines,
    }))
    .sort((a, b) => b.lines - a.lines) // Ordenar por líneas descendente

  // Convertir lenguajes a array
  const languages = Array.from(languageMap.entries())
    .map(([ext, stats]) => ({
      ext,
      files: stats.files,
      lines: stats.lines,
    }))
    .sort((a, b) => b.lines - a.lines) // Ordenar por líneas descendente

  // Generar rankings de relaciones (top 10)
  const mostImported = Array.from(importedByCountMap.entries())
    .map(([filePath, count]) => ({
      path: filePath,
      importedByCount: count,
    }))
    .sort((a, b) => b.importedByCount - a.importedByCount)
    .slice(0, 10)

  const mostImports = Array.from(importsCountMap.entries())
    .map(([filePath, count]) => ({
      path: filePath,
      importsCount: count,
    }))
    .sort((a, b) => b.importsCount - a.importsCount)
    .slice(0, 10)

  return {
    version: 1,
    schema: "repository-metrics-mvp",
    generatedAt: now,
    indexCommit: index.lastCommit,
    structure: {
      totalFiles: index.summary.totalFiles,
      totalLines: index.summary.totalLines,
      folders,
    },
    languages,
    relations: {
      mostImported,
      mostImports,
    },
    entrypoints,
  }
}


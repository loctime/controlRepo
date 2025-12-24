/**
 * Generador de métricas de repositorio
 * Procesa el índice y genera métricas estructurales y de relaciones
 */

import { RepositoryIndex } from "@/lib/types/repository"
import { ProjectBrain } from "@/lib/types/project-brain"
import { RepositoryMetrics } from "@/lib/types/repository-metrics"
import { posix } from "path"

/**
 * Normaliza un path a formato POSIX relativo con / final si es directorio
 */
function normalizeFolderPath(filePath: string): string {
  // Obtener directorio del archivo
  const dir = posix.dirname(filePath)
  
  // Si es raíz, retornar "/"
  if (dir === "." || dir === "/") {
    return "/"
  }
  
  // Normalizar y asegurar que termine con /
  const normalized = posix.normalize(dir)
  return normalized.endsWith("/") ? normalized : `${normalized}/`
}

/**
 * Obtiene la extensión de un archivo
 */
function getFileExtension(filePath: string): string {
  const ext = posix.extname(filePath)
  return ext || ".none"
}

/**
 * Detecta si un archivo es un entrypoint y retorna la razón
 */
function detectEntrypoint(filePath: string): { isEntrypoint: boolean; reason?: "filename" | "location" | "config" } {
  const fileName = posix.basename(filePath)
  const normalizedPath = posix.normalize(filePath)
  
  // Detección por nombre de archivo
  const entrypointFilenames = ["index.ts", "index.js", "main.ts", "main.js", "index.tsx", "main.tsx"]
  if (entrypointFilenames.includes(fileName)) {
    return { isEntrypoint: true, reason: "filename" }
  }
  
  // Detección por ubicación
  const entrypointLocations = [
    "app/page.tsx",
    "app/page.jsx",
    "src/index.ts",
    "src/index.js",
    "src/main.ts",
    "src/main.js",
  ]
  
  // Verificar si el path coincide con alguna ubicación de entrypoint
  for (const location of entrypointLocations) {
    if (normalizedPath === location || normalizedPath.endsWith(`/${location}`)) {
      return { isEntrypoint: true, reason: "location" }
    }
  }
  
  return { isEntrypoint: false }
}

/**
 * Genera métricas a partir de un índice de repositorio
 */
export function generateMetrics(
  index: RepositoryIndex,
  projectBrain?: ProjectBrain
): RepositoryMetrics {
  const now = new Date().toISOString()
  
  // Agrupación por carpetas
  const folderStats = new Map<string, { files: number; lines: number }>()
  
  // Agrupación por extensión
  const languageStats = new Map<string, { files: number; lines: number }>()
  
  // Estadísticas de relaciones
  const importedByCounts = new Map<string, number>()
  const importsCounts = new Map<string, number>()
  
  // Entrypoints detectados
  const entrypoints: Array<{ path: string; reason: "filename" | "location" | "config" }> = []
  
  // Procesar cada archivo
  for (const file of index.files) {
    // Agregar a estadísticas de carpetas
    const folderPath = normalizeFolderPath(file.path)
    const folderStat = folderStats.get(folderPath) || { files: 0, lines: 0 }
    folderStat.files++
    folderStat.lines += file.lines
    folderStats.set(folderPath, folderStat)
    
    // Agregar a estadísticas de lenguajes
    const ext = getFileExtension(file.path)
    const langStat = languageStats.get(ext) || { files: 0, lines: 0 }
    langStat.files++
    langStat.lines += file.lines
    languageStats.set(ext, langStat)
    
    // Contar imports
    const importedByCount = file.relations.importedBy?.length || 0
    if (importedByCount > 0) {
      importedByCounts.set(file.path, importedByCount)
    }
    
    const importsCount = file.relations.imports?.length || 0
    if (importsCount > 0) {
      importsCounts.set(file.path, importsCount)
    }
    
    // Detectar entrypoints
    const entrypointDetection = detectEntrypoint(file.path)
    if (entrypointDetection.isEntrypoint && entrypointDetection.reason) {
      entrypoints.push({
        path: file.path,
        reason: entrypointDetection.reason,
      })
    }
  }
  
  // Convertir mapas a arrays y ordenar
  const folders = Array.from(folderStats.entries())
    .map(([path, stats]) => ({
      path,
      files: stats.files,
      lines: stats.lines,
    }))
    .filter((folder) => folder.files >= 2) // Solo carpetas con al menos 2 archivos
    .sort((a, b) => b.lines - a.lines) // Ordenar por líneas descendente
  
  const languages = Array.from(languageStats.entries())
    .map(([ext, stats]) => ({
      ext,
      files: stats.files,
      lines: stats.lines,
    }))
    .sort((a, b) => b.lines - a.lines) // Ordenar por líneas descendente
  
  // Top 10 archivos más importados
  const mostImported = Array.from(importedByCounts.entries())
    .map(([path, count]) => ({
      path,
      importedByCount: count,
    }))
    .sort((a, b) => b.importedByCount - a.importedByCount)
    .slice(0, 10)
  
  // Top 10 archivos que más importan
  const mostImports = Array.from(importsCounts.entries())
    .map(([path, count]) => ({
      path,
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

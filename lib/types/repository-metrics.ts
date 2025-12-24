/**
 * Tipos para métricas de repositorio
 * Schema MVP para análisis estructural y de relaciones
 */

export interface RepositoryMetrics {
  // Metadatos del archivo
  version: number // Versión del schema (iniciar en 1)
  schema: string // "repository-metrics-mvp"
  generatedAt: string // ISO 8601
  indexCommit: string // SHA del commit indexado
  
  structure: {
    totalFiles: number
    totalLines: number
    folders: Array<{
      path: string // Path normalizado: relativo, con / final, sin dependencia del OS (ej: "src/components/")
      files: number
      lines: number
    }>
  }
  
  languages: Array<{
    ext: string // ".ts", ".tsx", etc.
    files: number
    lines: number
  }>
  
  relations: {
    mostImported: Array<{
      path: string
      importedByCount: number // Cantidad de archivos que importan este archivo
    }>
    mostImports: Array<{
      path: string
      importsCount: number // Cantidad de archivos que este archivo importa
    }>
  }
  
  entrypoints: Array<{
    path: string
    reason: "filename" | "location" | "config" // Razón por la que fue detectado como entrypoint
  }>
}

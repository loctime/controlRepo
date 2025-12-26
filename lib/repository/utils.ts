/**
 * Utilidades para el sistema de indexación de repositorios
 */

/**
 * Genera un repositoryId único que incluye owner, repo y branch
 * Formato: "owner/repo#branch"
 * 
 * Esto evita colisiones cuando se indexan múltiples ramas del mismo repositorio
 */
export function createRepositoryId(owner: string, repo: string, branch: string): string {
  return `${owner}/${repo}#${branch}`
}

/**
 * Normaliza un repositoryId para usar como nombre de archivo
 * Reemplaza caracteres especiales que no son válidos en nombres de archivo
 */
export function normalizeRepositoryIdForFile(repositoryId: string): string {
  return repositoryId.replace(/\//g, "_").replace(/#/g, "_")
}

/**
 * Parsea un repositoryId en sus componentes
 * Retorna null si el formato es inválido
 */
export function parseRepositoryId(repositoryId: string): { owner: string; repo: string; branch: string } | null {
  const match = repositoryId.match(/^(.+?)\/(.+?)#(.+)$/)
  if (!match) {
    return null
  }
  return {
    owner: match[1],
    repo: match[2],
    branch: match[3],
  }
}




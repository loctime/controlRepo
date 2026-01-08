/**
 * Utilidades para el sistema de indexación de repositorios
 */

/**
 * Genera un repositoryId único que incluye owner, repo y branch
 * Formato CANÓNICO: "owner/repo/branch"
 */
export function createRepositoryId(
  owner: string,
  repo: string,
  branch: string
): string {
  return `${owner}/${repo}/${branch}`
}

/**
 * Normaliza un repositoryId para usar como nombre de archivo
 * Ej: loctime/controlauditv2/main → loctime_controlauditv2_main
 * Ej: github:owner:repo → github_owner_repo
 */
export function normalizeRepositoryIdForFile(
  repositoryId: string
): string {
  return repositoryId.replace(/\//g, "_").replace(/:/g, "_")
}

/**
 * Parsea un repositoryId en sus componentes
 * Formato esperado: owner/repo/branch
 */
export function parseRepositoryId(
  repositoryId: string
): { owner: string; repo: string; branch: string } | null {
  const parts = repositoryId.split("/")
  if (parts.length !== 3) return null

  const [owner, repo, branch] = parts
  if (!owner || !repo || !branch) return null

  return { owner, repo, branch }
}

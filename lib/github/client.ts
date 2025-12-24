/**
 * Cliente para GitHub API
 * Solo se usa en el servidor (API routes)
 */

const GITHUB_API_BASE = "https://api.github.com"
const GITHUB_TOKEN = process.env.GITHUB_TOKEN

if (!GITHUB_TOKEN) {
  console.warn("⚠️ GITHUB_TOKEN no está configurado. Las llamadas a GitHub fallarán.")
}

interface GitHubTreeItem {
  path: string
  mode: string
  type: "blob" | "tree"
  sha: string
  size?: number
  url?: string
}

interface GitHubTreeResponse {
  sha: string
  url: string
  tree: GitHubTreeItem[]
  truncated: boolean
}

interface GitHubBlobResponse {
  sha: string
  node_id: string
  size: number
  url: string
  content: string
  encoding: "base64" | "utf-8"
}

interface GitHubRepositoryResponse {
  id: number
  name: string
  full_name: string
  description: string | null
  language: string | null
  stargazers_count: number
  forks_count: number
  topics: string[]
  default_branch: string
  created_at: string
  updated_at: string
}

interface GitHubCommitResponse {
  sha: string
  commit: {
    author: {
      date: string
    }
  }
}

interface GitHubBranchResponse {
  name: string
  commit: {
    sha: string
    commit: {
      author: {
        date: string
      }
    }
  }
  protected: boolean
}

/**
 * Obtiene el árbol completo de archivos del repositorio
 */
export async function getRepositoryTree(
  owner: string,
  repo: string,
  branch: string
): Promise<GitHubTreeResponse> {
  if (!GITHUB_TOKEN) {
    throw new Error("GITHUB_TOKEN no está configurado")
  }

  // Primero obtener el SHA del commit de la rama
  const branchResponse = await fetch(`${GITHUB_API_BASE}/repos/${owner}/${repo}/branches/${branch}`, {
    headers: {
      Authorization: `token ${GITHUB_TOKEN}`,
      Accept: "application/vnd.github.v3+json",
    },
  })

  if (!branchResponse.ok) {
    if (branchResponse.status === 404) {
      throw new Error(`Rama "${branch}" no encontrada en ${owner}/${repo}`)
    }
    throw new Error(`Error al obtener rama: ${branchResponse.statusText}`)
  }

  const branchData = await branchResponse.json()
  const commitSha = branchData.commit.sha

  // Obtener el árbol recursivo
  const treeResponse = await fetch(
    `${GITHUB_API_BASE}/repos/${owner}/${repo}/git/trees/${commitSha}?recursive=1`,
    {
      headers: {
        Authorization: `token ${GITHUB_TOKEN}`,
        Accept: "application/vnd.github.v3+json",
      },
    }
  )

  if (!treeResponse.ok) {
    throw new Error(`Error al obtener árbol: ${treeResponse.statusText}`)
  }

  return treeResponse.json()
}

/**
 * Obtiene el contenido de un archivo específico
 */
export async function getFileContent(
  owner: string,
  repo: string,
  path: string,
  branch: string
): Promise<GitHubBlobResponse> {
  if (!GITHUB_TOKEN) {
    throw new Error("GITHUB_TOKEN no está configurado")
  }

  const response = await fetch(
    `${GITHUB_API_BASE}/repos/${owner}/${repo}/contents/${path}?ref=${branch}`,
    {
      headers: {
        Authorization: `token ${GITHUB_TOKEN}`,
        Accept: "application/vnd.github.v3+json",
      },
    }
  )

  if (!response.ok) {
    if (response.status === 404) {
      throw new Error(`Archivo no encontrado: ${path}`)
    }
    throw new Error(`Error al obtener archivo: ${response.statusText}`)
  }

  return response.json()
}

/**
 * Obtiene metadatos del repositorio
 */
export async function getRepositoryMetadata(
  owner: string,
  repo: string
): Promise<GitHubRepositoryResponse> {
  if (!GITHUB_TOKEN) {
    throw new Error("GITHUB_TOKEN no está configurado")
  }

  const response = await fetch(`${GITHUB_API_BASE}/repos/${owner}/${repo}`, {
    headers: {
      Authorization: `token ${GITHUB_TOKEN}`,
      Accept: "application/vnd.github.v3+json",
    },
  })

  if (!response.ok) {
    if (response.status === 404) {
      throw new Error(`Repositorio no encontrado: ${owner}/${repo}`)
    }
    throw new Error(`Error al obtener repositorio: ${response.statusText}`)
  }

  return response.json()
}

/**
 * Obtiene el último commit de una rama
 */
export async function getLastCommit(
  owner: string,
  repo: string,
  branch: string
): Promise<string> {
  if (!GITHUB_TOKEN) {
    throw new Error("GITHUB_TOKEN no está configurado")
  }

  // Usar el endpoint correcto para obtener commits de una rama
  const response = await fetch(
    `${GITHUB_API_BASE}/repos/${owner}/${repo}/commits?sha=${branch}&per_page=1`,
    {
      headers: {
        Authorization: `token ${GITHUB_TOKEN}`,
        Accept: "application/vnd.github.v3+json",
      },
    }
  )

  if (!response.ok) {
    if (response.status === 404) {
      throw new Error(`Rama "${branch}" no encontrada en ${owner}/${repo}`)
    }
    throw new Error(`Error al obtener último commit: ${response.statusText}`)
  }

  const data: GitHubCommitResponse[] = await response.json()
  if (!Array.isArray(data) || data.length === 0) {
    throw new Error(`No se encontraron commits en la rama "${branch}"`)
  }
  return data[0]?.sha || ""
}

/**
 * Obtiene todas las ramas del repositorio
 */
export async function getAllBranches(
  owner: string,
  repo: string
): Promise<GitHubBranchResponse[]> {
  if (!GITHUB_TOKEN) {
    throw new Error("GITHUB_TOKEN no está configurado")
  }

  const response = await fetch(`${GITHUB_API_BASE}/repos/${owner}/${repo}/branches`, {
    headers: {
      Authorization: `token ${GITHUB_TOKEN}`,
      Accept: "application/vnd.github.v3+json",
    },
  })

  if (!response.ok) {
    throw new Error(`Error al obtener ramas: ${response.statusText}`)
  }

  return response.json()
}

/**
 * Valida si una rama existe en el repositorio
 */
export async function branchExists(
  owner: string,
  repo: string,
  branch: string
): Promise<boolean> {
  if (!GITHUB_TOKEN) {
    throw new Error("GITHUB_TOKEN no está configurado")
  }

  const response = await fetch(`${GITHUB_API_BASE}/repos/${owner}/${repo}/branches/${branch}`, {
    headers: {
      Authorization: `token ${GITHUB_TOKEN}`,
      Accept: "application/vnd.github.v3+json",
    },
  })

  return response.ok
}

/**
 * Resuelve automáticamente la rama del repositorio
 * Reglas:
 * 1. Si se proporciona requestedBranch, validar que existe
 * 2. Si no existe o no se proporciona, usar defaultBranch del repo
 * 3. Si tampoco existe, obtener todas las ramas y elegir la más reciente
 * 
 * @returns { branch: string, lastCommit: string }
 */
export async function resolveRepositoryBranch(
  owner: string,
  repo: string,
  requestedBranch?: string
): Promise<{ branch: string; lastCommit: string }> {
  // Obtener metadatos del repositorio para obtener defaultBranch
  const repoMetadata = await getRepositoryMetadata(owner, repo)
  const defaultBranch = repoMetadata.default_branch

  let resolvedBranch: string | null = null
  let lastCommit: string = ""

  // 1. Si se proporciona requestedBranch, validar que existe
  if (requestedBranch) {
    const exists = await branchExists(owner, repo, requestedBranch)
    if (exists) {
      resolvedBranch = requestedBranch
    } else {
      console.warn(`[BRANCH] Requested branch "${requestedBranch}" does not exist in ${owner}/${repo}`)
    }
  }

  // 2. Si no se resolvió, usar defaultBranch si existe
  if (!resolvedBranch && defaultBranch) {
    const exists = await branchExists(owner, repo, defaultBranch)
    if (exists) {
      resolvedBranch = defaultBranch
      console.log(`[BRANCH] Using default branch "${defaultBranch}" for ${owner}/${repo}`)
    }
  }

  // 3. Si tampoco existe, obtener todas las ramas y elegir la más reciente
  if (!resolvedBranch) {
    console.log(`[BRANCH] No valid branch found, fetching all branches for ${owner}/${repo}`)
    const branches = await getAllBranches(owner, repo)

    if (branches.length === 0) {
      throw new Error(`No se encontraron ramas en el repositorio ${owner}/${repo}`)
    }

    // Ordenar por fecha del commit más reciente (más reciente primero)
    branches.sort((a, b) => {
      const dateA = new Date(a.commit.commit.author.date).getTime()
      const dateB = new Date(b.commit.commit.author.date).getTime()
      return dateB - dateA
    })

    resolvedBranch = branches[0].name
    lastCommit = branches[0].commit.sha
    console.log(`[BRANCH] Selected most recent branch "${resolvedBranch}" for ${owner}/${repo}`)
  }

  // Obtener el último commit de la rama resuelta si no lo tenemos
  if (!lastCommit && resolvedBranch) {
    lastCommit = await getLastCommit(owner, repo, resolvedBranch)
  }

  if (!resolvedBranch) {
    throw new Error(`No se pudo resolver una rama válida para ${owner}/${repo}`)
  }

  return {
    branch: resolvedBranch,
    lastCommit,
  }
}


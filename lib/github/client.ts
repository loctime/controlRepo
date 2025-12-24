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

/**
 * Obtiene el árbol completo de archivos del repositorio
 */
export async function getRepositoryTree(
  owner: string,
  repo: string,
  branch: string = "main"
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
  branch: string = "main"
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
  branch: string = "main"
): Promise<string> {
  if (!GITHUB_TOKEN) {
    throw new Error("GITHUB_TOKEN no está configurado")
  }

  const response = await fetch(
    `${GITHUB_API_BASE}/repos/${owner}/${repo}/commits/${branch}?per_page=1`,
    {
      headers: {
        Authorization: `token ${GITHUB_TOKEN}`,
        Accept: "application/vnd.github.v3+json",
      },
    }
  )

  if (!response.ok) {
    throw new Error(`Error al obtener último commit: ${response.statusText}`)
  }

  const data: GitHubCommitResponse[] = await response.json()
  return data[0]?.sha || ""
}


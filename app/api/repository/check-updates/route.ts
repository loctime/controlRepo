import { NextRequest, NextResponse } from "next/server"
import { getRepositoryIndex } from "@/lib/repository/storage"
import { getLastCommit } from "@/lib/github/client"
import { createRepositoryId } from "@/lib/repository/utils"

/**
 * GET /api/repository/check-updates
 * Verifica si el repositorio tiene cambios comparando el commit SHA actual con el guardado
 * Operación LIVIANA - solo consulta el último commit, NO reindexa
 */
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams
    const owner = searchParams.get("owner")
    const repo = searchParams.get("repo")
    const branch = searchParams.get("branch")

    // Validar parámetros
    if (!owner || !repo) {
      return NextResponse.json(
        { error: "owner y repo son requeridos como query parameters" },
        { status: 400 }
      )
    }

    // Usar la rama proporcionada o buscar cualquier índice del repo
    let index: Awaited<ReturnType<typeof getRepositoryIndex>>
    let targetBranch: string = branch || "main" // Inicializar con valor por defecto

    if (branch) {
      const repositoryId = createRepositoryId(owner, repo, branch)
      index = await getRepositoryIndex(repositoryId)
    } else {
      // Si no se proporciona branch, buscar cualquier índice existente del repo
      // Por ahora, intentar con "main" y "master" como fallback
      const possibleBranches = ["main", "master"]
      index = null
      for (const possibleBranch of possibleBranches) {
        const repositoryId = createRepositoryId(owner, repo, possibleBranch)
        index = await getRepositoryIndex(repositoryId)
        if (index) {
          targetBranch = index.branch
          break
        }
      }
    }

    if (!index) {
      return NextResponse.json(
        { error: "No existe índice para este repositorio" },
        { status: 404 }
      )
    }

    // Usar la rama del índice si no se proporcionó una específica
    targetBranch = branch || index.branch
    const repositoryId = createRepositoryId(owner, repo, targetBranch)

    // Obtener último commit SHA del repositorio (operación liviana)
    let currentCommitSha: string
    try {
      currentCommitSha = await getLastCommit(owner, repo, targetBranch)
    } catch (error) {
      // Manejar errores de GitHub API (rate limit, repo privado, branch inexistente)
      console.error(`[CHECK-UPDATES] Error al obtener último commit para ${repositoryId}:`, error)
      return NextResponse.json(
        { 
          error: "No se pudo verificar el estado del repositorio",
          details: error instanceof Error ? error.message : "Error desconocido"
        },
        { status: 502 }
      )
    }

    const storedCommitSha = index.lastCommit

    // Comparar commits
    const hasUpdates = currentCommitSha !== storedCommitSha

    return NextResponse.json(
      {
        repositoryId,
        hasUpdates,
        currentCommitSha,
        storedCommitSha,
        branch: targetBranch,
      },
      { status: 200 }
    )
  } catch (error) {
    console.error("Error en GET /api/repository/check-updates:", error)
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Error desconocido",
      },
      { status: 500 }
    )
  }
}

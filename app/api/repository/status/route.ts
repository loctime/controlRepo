import { NextRequest, NextResponse } from "next/server"
import { getRepositoryIndex, isIndexing } from "@/lib/repository/storage"
import { RepositoryIndex } from "@/lib/types/repository"
import { createRepositoryId } from "@/lib/repository/utils"

/**
 * GET /api/repository/status
 * Obtiene el estado e índice completo de un repositorio
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
    let repositoryId: string

    if (branch) {
      repositoryId = createRepositoryId(owner, repo, branch)
      index = await getRepositoryIndex(repositoryId)
    } else {
      // Si no se proporciona branch, buscar cualquier índice existente del repo
      // Por ahora, intentar con "main" y "master" como fallback
      const possibleBranches = ["main", "master"]
      index = null
      for (const possibleBranch of possibleBranches) {
        repositoryId = createRepositoryId(owner, repo, possibleBranch)
        index = await getRepositoryIndex(repositoryId)
        if (index) break
      }
      if (!index) {
        repositoryId = createRepositoryId(owner, repo, "main") // Fallback
      }
    }

    // Verificar si está siendo indexado
    const indexing = await isIndexing(repositoryId)

    // Obtener índice si no lo tenemos
    if (!index) {
      index = await getRepositoryIndex(repositoryId)
    }

    // Si no existe índice, devolver estado según si está indexando o no
    if (!index) {
      if (indexing) {
        // Está indexando pero el índice aún no existe
        return NextResponse.json(
          {
            repositoryId,
            status: "indexing" as const,
          },
          { status: 200 }
        )
      } else {
        // No existe índice y tampoco está indexando
        return NextResponse.json(
          {
            repositoryId,
            status: "not_found" as const,
          },
          { status: 200 }
        )
      }
    }

    // Si está siendo indexado, actualizar estado
    if (indexing && index.status === "completed") {
      index.status = "indexing"
    }

    return NextResponse.json<RepositoryIndex>(index, { status: 200 })
  } catch (error) {
    console.error("Error en GET /api/repository/status:", error)
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Error desconocido",
      },
      { status: 500 }
    )
  }
}


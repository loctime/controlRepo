import { NextRequest, NextResponse } from "next/server"
import { getRepositoryIndex, isIndexing } from "@/lib/repository/storage"
import { RepositoryIndex } from "@/lib/types/repository"

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

    const repositoryId = `${owner}/${repo}`

    // Verificar si está siendo indexado
    const indexing = await isIndexing(repositoryId)

    // Obtener índice
    const index = await getRepositoryIndex(repositoryId)

    if (!index) {
      return NextResponse.json(
        {
          error: "Índice no encontrado. Usa /index para crear uno.",
        },
        { status: 404 }
      )
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


import { NextRequest, NextResponse } from "next/server"
import { indexRepository } from "@/lib/repository/indexer"
import { saveRepositoryIndex, acquireIndexLock, releaseIndexLock } from "@/lib/repository/storage"
import { IndexResponse } from "@/lib/types/repository"

/**
 * POST /api/repository/index
 * Indexa un repositorio completo
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { owner, repo, branch } = body

    // Validar parámetros
    if (!owner || !repo) {
      return NextResponse.json(
        { error: "owner y repo son requeridos" },
        { status: 400 }
      )
    }

    const repositoryId = `${owner}/${repo}`
    const actualBranch = branch || "main"

    // Intentar adquirir lock
    const lockAcquired = await acquireIndexLock(repositoryId, "system")
    if (!lockAcquired) {
      return NextResponse.json<IndexResponse>(
        {
          status: "error",
          repositoryId,
          error: "El repositorio ya está siendo indexado",
        },
        { status: 409 }
      )
    }

    try {
      // Iniciar indexación de forma asíncrona
      // En producción, esto debería ejecutarse en un worker/queue
      indexRepository(owner, repo, actualBranch)
        .then(async (index) => {
          // Guardar índice
          await saveRepositoryIndex(index)
          // Liberar lock
          await releaseIndexLock(repositoryId)
        })
        .catch(async (error) => {
          console.error(`Error al indexar ${repositoryId}:`, error)
          // Liberar lock en caso de error
          await releaseIndexLock(repositoryId)
        })

      // Retornar inmediatamente (indexación en background)
      return NextResponse.json<IndexResponse>(
        {
          status: "indexing",
          repositoryId,
          message: "Indexación iniciada",
        },
        { status: 202 }
      )
    } catch (error) {
      // Liberar lock si hay error al iniciar
      await releaseIndexLock(repositoryId)
      throw error
    }
  } catch (error) {
    console.error("Error en POST /api/repository/index:", error)
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Error desconocido",
      },
      { status: 500 }
    )
  }
}


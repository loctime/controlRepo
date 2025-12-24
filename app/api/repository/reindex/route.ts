import { NextRequest, NextResponse } from "next/server"
import { indexRepository } from "@/lib/repository/indexer"
import { saveRepositoryIndex, acquireIndexLock, releaseIndexLock, getRepositoryIndex } from "@/lib/repository/storage"
import { IndexResponse } from "@/lib/types/repository"

/**
 * POST /api/repository/reindex
 * Re-indexa un repositorio existente (fuerza re-indexación)
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

    // Verificar si existe un índice previo
    const existingIndex = await getRepositoryIndex(repositoryId)
    if (!existingIndex) {
      return NextResponse.json(
        { error: "No existe un índice previo. Usa /index en su lugar." },
        { status: 404 }
      )
    }

    // Intentar adquirir lock (forzar si está bloqueado y expiró)
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
      // Iniciar re-indexación de forma asíncrona
      indexRepository(owner, repo, actualBranch)
        .then(async (index) => {
          // Guardar nuevo índice (sobrescribe el anterior)
          await saveRepositoryIndex(index)
          // Liberar lock
          await releaseIndexLock(repositoryId)
        })
        .catch(async (error) => {
          console.error(`Error al re-indexar ${repositoryId}:`, error)
          // Liberar lock en caso de error
          await releaseIndexLock(repositoryId)
        })

      // Retornar inmediatamente (re-indexación en background)
      return NextResponse.json<IndexResponse>(
        {
          status: "indexing",
          repositoryId,
          message: "Re-indexación iniciada",
        },
        { status: 202 }
      )
    } catch (error) {
      // Liberar lock si hay error al iniciar
      await releaseIndexLock(repositoryId)
      throw error
    }
  } catch (error) {
    console.error("Error en POST /api/repository/reindex:", error)
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Error desconocido",
      },
      { status: 500 }
    )
  }
}


import { NextRequest, NextResponse } from "next/server"
import { indexRepository } from "@/lib/repository/indexer"
import { saveRepositoryIndex, acquireIndexLock, releaseIndexLock, getRepositoryIndex } from "@/lib/repository/storage"
import { IndexResponse } from "@/lib/types/repository"
import { resolveRepositoryBranch } from "@/lib/github/client"

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

    // Validar GITHUB_TOKEN al inicio
    if (!process.env.GITHUB_TOKEN) {
      return NextResponse.json(
        { error: "GITHUB_TOKEN no configurado. Configura .env.local" },
        { status: 401 }
      )
    }

    const repositoryId = `${owner}/${repo}`

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
      // Resolver rama automáticamente (usar la del índice existente si no se proporciona)
      const resolvedBranch = await resolveRepositoryBranch(owner, repo, branch || existingIndex.branch)
      const actualBranch = resolvedBranch.branch

      // Actualizar índice existente a status "indexing" antes de iniciar
      existingIndex.status = "indexing"
      existingIndex.branch = actualBranch
      existingIndex.lastCommit = resolvedBranch.lastCommit
      existingIndex.files = []
      existingIndex.keyFiles = {}
      existingIndex.summary = {
        totalFiles: 0,
        totalLines: 0,
        languages: {},
        categories: {
          component: 0,
          hook: 0,
          service: 0,
          config: 0,
          docs: 0,
          test: 0,
          utility: 0,
          style: 0,
          other: 0,
        },
        structure: {
          components: 0,
          hooks: 0,
          services: 0,
          configs: 0,
          docs: 0,
          tests: 0,
        },
      }
      await saveRepositoryIndex(existingIndex)
      console.log(`[INDEX] Re-indexing started for ${repositoryId}`)

      // Iniciar re-indexación de forma asíncrona
      indexRepository(owner, repo, actualBranch)
        .then(async (updatedIndex) => {
          // Actualizar índice con los archivos procesados
          updatedIndex.status = "completed"
          await saveRepositoryIndex(updatedIndex)
          console.log(`[INDEX] Re-indexing completed for ${repositoryId} (${updatedIndex.files.length} files)`)
          // Liberar lock
          await releaseIndexLock(repositoryId)
        })
        .catch(async (error) => {
          console.error(`[INDEX] Error re-indexing ${repositoryId}:`, error)
          // Actualizar índice con estado de error
          const errorIndex = await getRepositoryIndex(repositoryId)
          if (errorIndex) {
            errorIndex.status = "error"
            await saveRepositoryIndex(errorIndex)
          }
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


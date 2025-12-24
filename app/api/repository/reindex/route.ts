import { NextRequest, NextResponse } from "next/server"
import { indexRepository } from "@/lib/repository/indexer"
import { saveRepositoryIndex, acquireIndexLock, releaseIndexLock, getRepositoryIndex } from "@/lib/repository/storage"
import { IndexResponse } from "@/lib/types/repository"
import { resolveRepositoryBranch } from "@/lib/github/client"
import { createRepositoryId } from "@/lib/repository/utils"
import { generateMinimalProjectBrain } from "@/lib/project-brain/generator"
import { saveProjectBrain } from "@/lib/project-brain/storage-filesystem"
import { generateMetrics } from "@/lib/repository/metrics/generator"
import { saveMetrics } from "@/lib/repository/metrics/storage-filesystem"

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

    // Resolver rama primero para crear repositoryId con branch
    let resolvedBranch: { branch: string; lastCommit: string }
    let existingIndex: Awaited<ReturnType<typeof getRepositoryIndex>>

    try {
      // Intentar obtener índice existente primero (puede ser con branch diferente)
      // Si no se proporciona branch, buscar cualquier índice del repo
      if (branch) {
        const repositoryIdWithBranch = createRepositoryId(owner, repo, branch)
        existingIndex = await getRepositoryIndex(repositoryIdWithBranch)
      } else {
        // Si no se proporciona branch, buscar el índice más reciente del repo
        // Por ahora, intentar con "main" y "master" como fallback
        const possibleBranches = ["main", "master"]
        for (const possibleBranch of possibleBranches) {
          const repositoryIdWithBranch = createRepositoryId(owner, repo, possibleBranch)
          existingIndex = await getRepositoryIndex(repositoryIdWithBranch)
          if (existingIndex) break
        }
      }

      if (!existingIndex) {
        return NextResponse.json(
          { error: "No existe un índice previo. Usa /index en su lugar." },
          { status: 404 }
        )
      }

      // Resolver rama automáticamente (usar la del índice existente si no se proporciona)
      resolvedBranch = await resolveRepositoryBranch(owner, repo, branch || existingIndex.branch)
    } catch (error) {
      return NextResponse.json(
        { error: `Error al resolver rama: ${error instanceof Error ? error.message : "Error desconocido"}` },
        { status: 400 }
      )
    }

    const actualBranch = resolvedBranch.branch
    const repositoryId = createRepositoryId(owner, repo, actualBranch)

    // Si el branch cambió, necesitamos crear un nuevo índice o actualizar el existente
    if (existingIndex.branch !== actualBranch) {
      // Crear nuevo índice para la nueva rama
      existingIndex = {
        ...existingIndex,
        id: repositoryId,
        branch: actualBranch,
        lastCommit: resolvedBranch.lastCommit,
      }
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
          
          // Generar Project Brain (siempre regenerar en reindex)
          const projectBrain = generateMinimalProjectBrain(updatedIndex)
          await saveProjectBrain(projectBrain)
          console.log(`[INDEX] Project Brain regenerated for ${repositoryId}`)
          
          // Generar y guardar métricas
          const metrics = generateMetrics(updatedIndex, projectBrain)
          await saveMetrics(repositoryId, metrics)
          console.log(`[INDEX] Metrics regenerated for ${repositoryId}`)
          
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


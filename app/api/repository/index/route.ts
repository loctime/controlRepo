import { NextRequest, NextResponse } from "next/server"
import { indexRepository } from "@/lib/repository/indexer"
import { saveRepositoryIndex, acquireIndexLock, releaseIndexLock, getRepositoryIndex } from "@/lib/repository/storage"
import { IndexResponse, RepositoryIndex } from "@/lib/types/repository"
import { getRepositoryMetadata, resolveRepositoryBranch } from "@/lib/github/client"
import { generateMinimalProjectBrain } from "@/lib/project-brain/generator"
import { saveProjectBrain, hasProjectBrain } from "@/lib/project-brain/storage-filesystem"

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

    // Validar GITHUB_TOKEN al inicio
    if (!process.env.GITHUB_TOKEN) {
      return NextResponse.json(
        { error: "GITHUB_TOKEN no configurado. Configura .env.local" },
        { status: 401 }
      )
    }

    const repositoryId = `${owner}/${repo}`

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
      // Resolver rama automáticamente
      let resolvedBranch: { branch: string; lastCommit: string }
      let repoMetadata

      try {
        repoMetadata = await getRepositoryMetadata(owner, repo)
        resolvedBranch = await resolveRepositoryBranch(owner, repo, branch)
      } catch (error) {
        console.error(`[INDEX] Error resolving branch for ${repositoryId}:`, error)
        throw new Error(`Error al resolver rama del repositorio: ${error instanceof Error ? error.message : "Error desconocido"}`)
      }

      const finalBranch = resolvedBranch.branch
      const lastCommit = resolvedBranch.lastCommit
      const defaultBranch = repoMetadata.default_branch

      // Crear índice inicial con status "indexing"
      const initialIndex: RepositoryIndex = {
        id: repositoryId,
        owner,
        repo,
        branch: finalBranch,
        defaultBranch,
        status: "indexing",
        indexedAt: new Date().toISOString(),
        lastCommit,
        metadata: {
          description: repoMetadata.description || undefined,
          language: repoMetadata.language || undefined,
          stars: repoMetadata.stargazers_count,
          forks: repoMetadata.forks_count,
          topics: repoMetadata.topics,
          createdAt: repoMetadata.created_at,
          updatedAt: repoMetadata.updated_at,
        },
        files: [],
        keyFiles: {},
        summary: {
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
        },
      }

      // Persistir índice inicial inmediatamente
      await saveRepositoryIndex(initialIndex)
      console.log(`[INDEX] Created initial index for ${repositoryId}`)

      // Iniciar indexación de forma asíncrona
      // En producción, esto debería ejecutarse en un worker/queue
      console.log(`[INDEX] Indexing started for ${repositoryId}`)
      indexRepository(owner, repo, finalBranch)
        .then(async (updatedIndex) => {
          // Actualizar índice con los archivos procesados
          updatedIndex.status = "completed"
          await saveRepositoryIndex(updatedIndex)
          console.log(`[INDEX] Indexing completed for ${repositoryId} (${updatedIndex.files.length} files)`)
          
          // Crear Project Brain solo si no existe
          const brainExists = await hasProjectBrain(repositoryId)
          if (!brainExists) {
            const projectBrain = generateMinimalProjectBrain(updatedIndex)
            await saveProjectBrain(projectBrain)
            console.log(`[INDEX] Project Brain created for ${repositoryId}`)
          }
          
          // Liberar lock
          await releaseIndexLock(repositoryId)
        })
        .catch(async (error) => {
          console.error(`[INDEX] Error indexing ${repositoryId}:`, error)
          // Actualizar índice con estado de error
          const existingIndex = await getRepositoryIndex(repositoryId)
          if (existingIndex) {
            existingIndex.status = "error"
            await saveRepositoryIndex(existingIndex)
          }
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


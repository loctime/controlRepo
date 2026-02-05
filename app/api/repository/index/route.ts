import { NextRequest, NextResponse } from "next/server"
import { indexRepository } from "@/lib/repository/indexer"
import { saveRepositoryIndex, acquireIndexLock, releaseIndexLock, getRepositoryIndex } from "@/lib/repository/storage"
import { createRepositoryId } from "@/lib/repository/utils"
import { resolveRepositoryBranch } from "@/lib/github/client"
import { generateMinimalProjectBrain } from "@/lib/project-brain/generator"
import { saveProjectBrain } from "@/lib/project-brain/storage-filesystem"
import { generateMetrics } from "@/lib/repository/metrics/generator"
import { saveMetrics } from "@/lib/repository/metrics/storage-filesystem"
import type { IndexResponse, RepositoryIndex } from "@/lib/types/repository"

/**
 * POST /api/repository/index
 * Indexa un repositorio localmente (sin dependencias cloud).
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { repositoryId, force } = body

    if (!repositoryId || typeof repositoryId !== "string") {
      return NextResponse.json(
        { error: "repositoryId es requerido (formato: github:owner:repo)" },
        { status: 400 }
      )
    }

    if (!repositoryId.startsWith("github:")) {
      return NextResponse.json(
        { error: "repositoryId debe tener formato: github:owner:repo" },
        { status: 400 }
      )
    }

    const parts = repositoryId.replace("github:", "").split(":")
    if (parts.length !== 2) {
      return NextResponse.json(
        { error: "repositoryId inválido. Formato esperado: github:owner:repo" },
        { status: 400 }
      )
    }

    const owner = parts[0].trim()
    const repo = parts[1].trim()

    if (!owner || !repo) {
      return NextResponse.json(
        { error: "repositoryId inválido: owner o repo vacíos" },
        { status: 400 }
      )
    }

    let resolvedBranch: { branch: string; lastCommit: string }
    try {
      resolvedBranch = await resolveRepositoryBranch(owner, repo)
    } catch (error) {
      return NextResponse.json(
        { error: `Error al resolver rama: ${error instanceof Error ? error.message : "Error desconocido"}` },
        { status: 400 }
      )
    }

    const actualBranch = resolvedBranch.branch
    const repoIdWithBranch = createRepositoryId(owner, repo, actualBranch)

    const existingIndex = await getRepositoryIndex(repoIdWithBranch)
    if (existingIndex && !force) {
      return NextResponse.json<IndexResponse>(
        {
          status: existingIndex.status === "error" ? "error" : existingIndex.status,
          repositoryId: existingIndex.id,
          message: existingIndex.status === "completed"
            ? "Repositorio ya indexado"
            : "Indexación en progreso",
        },
        { status: existingIndex.status === "completed" ? 200 : 202 }
      )
    }

    const lockAcquired = await acquireIndexLock(repoIdWithBranch, "system")
    if (!lockAcquired) {
      return NextResponse.json<IndexResponse>(
        {
          status: "error",
          repositoryId: repoIdWithBranch,
          error: "El repositorio ya está siendo indexado",
        },
        { status: 409 }
      )
    }

    const now = new Date().toISOString()
    const baseIndex: RepositoryIndex = {
      id: repoIdWithBranch,
      owner,
      repo,
      branch: actualBranch,
      defaultBranch: actualBranch,
      status: "indexing",
      indexedAt: now,
      lastCommit: resolvedBranch.lastCommit,
      metadata: {},
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

    await saveRepositoryIndex(baseIndex)

    indexRepository(owner, repo, actualBranch)
      .then(async (updatedIndex) => {
        updatedIndex.status = "completed"
        await saveRepositoryIndex(updatedIndex)

        const projectBrain = generateMinimalProjectBrain(updatedIndex)
        await saveProjectBrain(projectBrain)

        const metrics = generateMetrics(updatedIndex, projectBrain)
        await saveMetrics(repoIdWithBranch, metrics)

        await releaseIndexLock(repoIdWithBranch)
      })
      .catch(async (error) => {
        console.error(`[INDEX] Error al indexar ${repoIdWithBranch}:`, error)
        const errorIndex = await getRepositoryIndex(repoIdWithBranch)
        if (errorIndex) {
          errorIndex.status = "error"
          await saveRepositoryIndex(errorIndex)
        }
        await releaseIndexLock(repoIdWithBranch)
      })

    return NextResponse.json<IndexResponse>(
      {
        status: "indexing",
        repositoryId: repoIdWithBranch,
        message: "Indexación iniciada",
      },
      { status: 202 }
    )
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

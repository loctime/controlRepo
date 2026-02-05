import { NextRequest, NextResponse } from "next/server"
import { getRepositoryIndex } from "@/lib/repository/storage-filesystem"
import { getMetrics } from "@/lib/repository/metrics/storage-filesystem"
import { createRepositoryId } from "@/lib/repository/utils"

/**
 * GET /api/repository/metrics
 * Lee métricas desde el filesystem local.
 */
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams
    const owner = searchParams.get("owner")
    const repo = searchParams.get("repo")
    const branch = searchParams.get("branch")

    if (!owner || !repo) {
      return NextResponse.json(
        { error: "owner y repo son requeridos" },
        { status: 400 }
      )
    }

    const repositoryId = branch
      ? createRepositoryId(owner, repo, branch)
      : `github:${owner}:${repo}`

    const index = await getRepositoryIndex(repositoryId)
    if (!index) {
      return NextResponse.json(
        { error: "No existe índice local para este repositorio" },
        { status: 404 }
      )
    }

    const metrics = await getMetrics(index.id)
    if (!metrics) {
      return NextResponse.json(
        { error: "No hay métricas disponibles para este repositorio" },
        { status: 404 }
      )
    }

    return NextResponse.json(metrics)
  } catch (error) {
    console.error("Error en GET /api/repository/metrics:", error)
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Error desconocido",
      },
      { status: 500 }
    )
  }
}

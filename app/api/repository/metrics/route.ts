import { NextRequest, NextResponse } from "next/server"
import { getMetrics } from "@/lib/repository/metrics/storage-filesystem"
import { createRepositoryId } from "@/lib/repository/utils"

/**
 * GET /api/repository/metrics
 * Obtiene las métricas del repositorio activo
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
        { error: "owner y repo son requeridos" },
        { status: 400 }
      )
    }

    // Crear repositoryId
    const repositoryId = createRepositoryId(owner, repo, branch || "main")

    // Obtener métricas
    const metrics = await getMetrics(repositoryId)

    if (!metrics) {
      return NextResponse.json(
        { error: "No se encontraron métricas para este repositorio" },
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

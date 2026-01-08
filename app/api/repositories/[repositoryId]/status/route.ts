/**
 * GET /api/repositories/{repositoryId}/status
 * Proxy que delega a /api/repository/status
 * Según contrato API v1
 */
import { NextRequest, NextResponse } from "next/server"

export async function GET(
  request: NextRequest,
  { params }: { params: { repositoryId: string } }
) {
  const repositoryId = params.repositoryId

  if (!repositoryId) {
    return NextResponse.json(
      { error: "repositoryId es requerido" },
      { status: 400 }
    )
  }

  // Redirigir a la ruta real con query param
  const url = new URL(request.url)
  url.pathname = "/api/repository/status"
  url.searchParams.set("repositoryId", repositoryId)

  try {
    const response = await fetch(url.toString(), {
      method: "GET",
      headers: request.headers,
    })

    const data = await response.json()

    // Transformar al formato del contrato si es necesario
    // El contrato espera: { repositoryId, status, indexedAt?, stats?, error }
    // y siempre devuelve 200
    if (response.status === 404 || response.status === 400) {
      // Según contrato: nunca devuelve 404, siempre 200 con status: "idle"
      return NextResponse.json({
        repositoryId,
        status: "idle" as const,
        error: null,
      })
    }

    // Mapear "completed" a "ready" según contrato
    const transformedData = {
      ...data,
      status: data.status === "completed" ? "ready" : data.status,
      // Asegurar que stats tenga el formato correcto
      stats: data.stats
        ? {
            totalFiles: data.stats.totalFiles || 0,
            totalSize: data.stats.totalSize || 0,
            languages: Array.isArray(data.stats.languages)
              ? data.stats.languages
              : data.stats.languages
              ? Object.keys(data.stats.languages)
              : [],
          }
        : undefined,
    }

    return NextResponse.json(transformedData, { status: 200 })
  } catch (error) {
    console.error("Error en proxy de status:", error)
    // Según contrato: siempre devuelve 200
    return NextResponse.json({
      repositoryId,
      status: "error" as const,
      error: error instanceof Error ? error.message : "Error desconocido",
    })
  }
}

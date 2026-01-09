/**
 * GET /api/repositories/{repositoryId}/status
 * Proxy que delega a /api/repository/status
 * Según contrato API v1
 */
import { NextRequest, NextResponse } from "next/server"

/**
 * Normaliza languages para que siempre sea un array de strings
 * - Si es array → usarlo
 * - Si es objeto (mapa) → Object.keys(languages)
 * - Si no existe → []
 */
function normalizeLanguages(languages: any): string[] {
  if (Array.isArray(languages)) {
    return languages
  }
  if (languages && typeof languages === "object") {
    return Object.keys(languages)
  }
  return []
}

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

    // No mapear status - aceptar "completed" directamente
    // Normalizar languages siempre - el frontend NO debe manejar formatos variables
    const transformedData = {
      ...data,
      status: data.status, // Mantener el status tal como viene del backend
      // Asegurar que stats tenga el formato correcto con languages normalizado
      stats: data.stats
        ? {
            totalFiles: data.stats.totalFiles || 0,
            totalSize: data.stats.totalSize || 0,
            languages: normalizeLanguages(data.stats.languages),
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

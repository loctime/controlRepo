import { NextRequest, NextResponse } from "next/server"

/**
 * GET /api/repository/metrics
 * Proxy que consulta las métricas del repositorio desde ControlFile (Render)
 * 
 * Las métricas se almacenan en el backend de Render, no en Vercel.
 * Este endpoint actúa como proxy para consultar las métricas desde el backend correcto.
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

    // Construir URL del backend de Render
    const controlFileUrl = process.env.CONTROLFILE_URL || process.env.NEXT_PUBLIC_CONTROLFILE_URL
    if (!controlFileUrl) {
      console.error("[METRICS] CONTROLFILE_URL no configurada")
      return NextResponse.json(
        { error: "Configuración del backend no disponible" },
        { status: 500 }
      )
    }

    // Construir query string para el backend
    const queryParams = new URLSearchParams({
      owner,
      repo,
    })
    if (branch) {
      queryParams.append("branch", branch)
    }

    const backendUrl = `${controlFileUrl}/api/repository/metrics?${queryParams.toString()}`
    console.log(`[METRICS] Consultando backend: ${backendUrl}`)

    try {
      const backendResponse = await fetch(backendUrl, {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
        },
      })

      const responseData = await backendResponse.json()
      console.log(`[METRICS] Respuesta del backend: ${backendResponse.status}`)

      // Retornar respuesta del backend (incluyendo 404 si no hay métricas)
      return NextResponse.json(responseData, {
        status: backendResponse.status,
      })
    } catch (fetchError) {
      console.error("[METRICS] Error al comunicarse con ControlFile:", fetchError)
      return NextResponse.json(
        {
          error: "Error al comunicarse con el backend de indexación",
          details: fetchError instanceof Error ? fetchError.message : "Error desconocido",
        },
        { status: 502 }
      )
    }
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

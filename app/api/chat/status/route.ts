import { NextRequest, NextResponse } from "next/server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * GET /api/chat/status
 * Obtiene el estado de conexión del LLM desde el backend ControlFile
 * 
 * Response:
 *   - 200: { ok: boolean, provider?: string, model?: string, error?: string }
 *   - 500: Error al comunicarse con el backend
 */
export async function GET(req: NextRequest) {
  try {
    // Obtener URL del backend ControlFile
    const controlFileUrl = process.env.CONTROLFILE_URL || process.env.NEXT_PUBLIC_CONTROLFILE_URL
    if (!controlFileUrl) {
      return NextResponse.json(
        { ok: false, error: "CONTROLFILE_URL no configurada" },
        { status: 500 }
      )
    }

    // Consultar estado del LLM en el backend
    const backendUrl = `${controlFileUrl}/api/chat/status`
    
    try {
      // Crear AbortController para timeout manual (compatible)
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 5000)

      const backendResponse = await fetch(backendUrl, {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
        },
        signal: controller.signal,
      })

      clearTimeout(timeoutId)

      if (!backendResponse.ok) {
        return NextResponse.json(
          { ok: false, error: `Backend respondió con status ${backendResponse.status}` },
          { status: 200 } // Devolver 200 para que el frontend pueda manejar el estado
        )
      }

      const backendData = await backendResponse.json()
      
      // Reenviar respuesta del backend
      return NextResponse.json(backendData, { status: 200 })
    } catch (fetchError) {
      // Si hay error de conexión o timeout, devolver estado desconocido
      if (fetchError instanceof Error && fetchError.name === "TimeoutError") {
        return NextResponse.json(
          { ok: false, error: "Timeout al consultar el backend" },
          { status: 200 }
        )
      }
      
      return NextResponse.json(
        { 
          ok: false, 
          error: fetchError instanceof Error ? fetchError.message : "Error desconocido al consultar el backend" 
        },
        { status: 200 }
      )
    }
  } catch (error) {
    console.error("Error en /api/chat/status:", error)

    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Error desconocido",
      },
      { status: 500 }
    )
  }
}

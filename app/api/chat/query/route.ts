import { NextRequest, NextResponse } from "next/server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * POST /api/chat/query
 * Proxy simple que reenvía la request al backend ControlFile
 * 
 * Request: { repositoryId, question, conversationId? }
 * Response: 
 *   - 200: { response: string, conversationId?: string, sources?: Array<{ path: string, lines?: number[] }> }
 *   - 202: { status: "indexing", message: string }
 *   - 400: { status: "idle" | "error", message: string }
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { repositoryId, question, conversationId } = body

    // Validaciones básicas
    if (!question || typeof question !== "string") {
      return NextResponse.json(
        { error: "question es requerido" },
        { status: 400 }
      )
    }

    if (!repositoryId || typeof repositoryId !== "string") {
      return NextResponse.json(
        { error: "repositoryId es requerido" },
        { status: 400 }
      )
    }

    // Obtener URL del backend ControlFile
    const controlFileUrl = process.env.CONTROLFILE_URL || process.env.NEXT_PUBLIC_CONTROLFILE_URL
    if (!controlFileUrl) {
      return NextResponse.json(
        { error: "CONTROLFILE_URL no configurada" },
        { status: 500 }
      )
    }

    // Reenviar request al backend ControlFile
    const backendUrl = `${controlFileUrl}/api/chat/query`
    const backendResponse = await fetch(backendUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        repositoryId,
        question,
        ...(conversationId && { conversationId }),
      }),
    })

    // Obtener respuesta del backend
    const backendData = await backendResponse.json()

    // Reenviar respuesta tal cual con el mismo status code
    return NextResponse.json(backendData, { status: backendResponse.status })
  } catch (error) {
    console.error("Error en /api/chat/query:", error)

    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Error desconocido",
      },
      { status: 500 }
    )
  }
}

import { NextResponse } from "next/server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * GET /api/chat/status
 * Verifica si Ollama local está disponible.
 */
export async function GET() {
  try {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 3000)

    const response = await fetch("http://localhost:11434/api/tags", {
      method: "GET",
      headers: { "Content-Type": "application/json" },
      signal: controller.signal,
    })

    clearTimeout(timeoutId)

    if (!response.ok) {
      return NextResponse.json(
        { ok: false, error: `Ollama no disponible (status ${response.status})` },
        { status: 200 }
      )
    }

    return NextResponse.json(
      { ok: true, provider: "ollama", model: "phi3:mini" },
      { status: 200 }
    )
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Error desconocido"
    return NextResponse.json(
      { ok: false, error: `Ollama no disponible: ${errorMessage}` },
      { status: 200 }
    )
  }
}

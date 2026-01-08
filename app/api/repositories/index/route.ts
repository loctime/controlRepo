/**
 * POST /api/repositories/index
 * Proxy que delega a /api/repository/index
 * Según contrato API v1
 */
import { NextRequest, NextResponse } from "next/server"

export async function POST(request: NextRequest) {
  // Redirigir a la ruta real
  const url = new URL(request.url)
  url.pathname = "/api/repository/index"
  
  const response = await fetch(url.toString(), {
    method: "POST",
    headers: request.headers,
    body: request.body,
  })

  const data = await response.json()

  // Transformar respuesta al formato del contrato si es necesario
  return NextResponse.json(data, { status: response.status })
}

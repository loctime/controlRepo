import { NextRequest, NextResponse } from "next/server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * POST /api/chat/query
 * 
 * @deprecated Este endpoint ha sido deprecado. Usa POST /api/chat en su lugar.
 * 
 * Este endpoint era un proxy hacia ControlFile, pero ahora el cerebro está
 * completamente en ControlRepo y se debe usar /api/chat directamente.
 */
export async function POST(req: NextRequest) {
  return NextResponse.json(
    {
      error: "Endpoint deprecated. Use /api/chat",
      message: "Este endpoint ha sido deprecado. Por favor, usa POST /api/chat en su lugar.",
    },
    { status: 410 } // 410 Gone - recurso ya no está disponible
  )
}

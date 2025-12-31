import { NextRequest, NextResponse } from "next/server"

/**
 * GET /api/repository/status/:repositoryId
 * Proxy que consulta el estado e índice completo desde ControlFile (Render)
 * 
 * Los índices se almacenan en el backend de Render, no en Vercel.
 * Este endpoint actúa como proxy para consultar el estado desde el backend correcto.
 * 
 * @param repositoryId - Formato: github:owner:repo
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { repositoryId: string } }
) {
  console.log(`[STATUS] GET /api/repository/status/${params.repositoryId} - Endpoint llamado`)
  
  try {
    const repositoryId = params.repositoryId
    
    // Validar formato de repositoryId
    if (!repositoryId || !repositoryId.startsWith("github:")) {
      return NextResponse.json(
        { error: "repositoryId debe tener formato: github:owner:repo" },
        { status: 400 }
      )
    }

    // Construir URL del backend de Render
    const controlFileUrl = process.env.CONTROLFILE_URL || process.env.NEXT_PUBLIC_CONTROLFILE_URL
    if (!controlFileUrl) {
      console.error("[STATUS] CONTROLFILE_URL no configurada")
      return NextResponse.json(
        { error: "Configuración del backend no disponible" },
        { status: 500 }
      )
    }
    
    // El backend espera: GET /api/repository/status/:repositoryId
    const backendUrl = `${controlFileUrl}/api/repository/status/${repositoryId}`
    console.log(`[STATUS] Consultando backend: ${backendUrl}`)

    try {
      const backendResponse = await fetch(backendUrl, {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
        },
      })

      const responseData = await backendResponse.json()
      console.log(`[STATUS] Respuesta del backend: ${backendResponse.status}`)

      // Retornar respuesta del backend
      return NextResponse.json(responseData, {
        status: backendResponse.status,
      })
    } catch (fetchError) {
      console.error("[STATUS] Error al comunicarse con ControlFile:", fetchError)
      return NextResponse.json(
        {
          error: "Error al comunicarse con el backend de indexación",
          details: fetchError instanceof Error ? fetchError.message : "Error desconocido",
        },
        { status: 502 }
      )
    }
  } catch (error) {
    console.error("Error en GET /api/repository/status/:repositoryId:", error)
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Error desconocido",
      },
      { status: 500 }
    )
  }
}

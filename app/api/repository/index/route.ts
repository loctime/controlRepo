import { NextRequest, NextResponse } from "next/server"
import { getAuthenticatedUserId } from "@/lib/auth/server-auth"

/**
 * POST /api/repository/index
 * Proxy/Gateway que delega la indexación a ControlFile (Render)
 * 
 * Responsabilidades:
 * 1. Autenticar usuario (Firebase)
 * 2. Validar parámetros básicos
 * 3. Hacer POST HTTP a ControlFile (Render)
 * 4. Retornar respuesta del backend
 * 
 * NO hace:
 * - Escritura en filesystem
 * - Adquisición de locks
 * - Indexación de repositorios
 * - Generación de métricas o project brain
 */
export async function POST(request: NextRequest) {
  console.log("[INDEX] POST /api/repository/index - Iniciando proxy a ControlFile")
  console.log(JSON.stringify({
    level: "info",
    service: "controlfile-backend",
    environment: process.env.NODE_ENV || "production",
    timestamp: new Date().toISOString(),
    path: "/api/repository/index",
    method: "POST",
    message: "Proxy iniciado",
  }))

  try {
    // 1) Autenticación: Verificar token Firebase y obtener UID
    let uid: string
    try {
      console.log("[INDEX] Verificando autenticación...")
      uid = await getAuthenticatedUserId(request)
      console.log(`[INDEX] Usuario autenticado: ${uid}`)
    } catch (error) {
      console.error("[INDEX] Error de autenticación:", error)
      return NextResponse.json(
        { error: error instanceof Error ? error.message : "No autorizado" },
        { status: 401 }
      )
    }

    // 2) Validar parámetros según contrato API v1
    const body = await request.json()
    const { repositoryId, force } = body
    console.log(`[INDEX] Parámetros recibidos: repositoryId=${repositoryId}, force=${force || false}`)

    if (!repositoryId || typeof repositoryId !== "string") {
      return NextResponse.json(
        { error: "repositoryId es requerido (formato: github:owner:repo)" },
        { status: 400 }
      )
    }

    // Validar formato: github:owner:repo
    if (!repositoryId.startsWith("github:")) {
      return NextResponse.json(
        { error: "repositoryId debe tener formato: github:owner:repo" },
        { status: 400 }
      )
    }

    // Parsear repositoryId
    const parts = repositoryId.replace("github:", "").split(":")
    if (parts.length !== 2) {
      return NextResponse.json(
        { error: "repositoryId inválido. Formato esperado: github:owner:repo" },
        { status: 400 }
      )
    }

    const owner = parts[0].trim()
    const repo = parts[1].trim()
    const branch = "main" // Por defecto, el backend puede usar main

    if (!owner || !repo) {
      return NextResponse.json(
        { error: "repositoryId inválido: owner o repo vacíos" },
        { status: 400 }
      )
    }

    console.log(`[INDEX] Parseado: owner=${owner}, repo=${repo}, branch=${branch}`)

    // 3) Hacer POST HTTP a ControlFile (Render)
    const controlFileUrl = process.env.CONTROLFILE_URL || process.env.NEXT_PUBLIC_CONTROLFILE_URL
    if (!controlFileUrl) {
      console.error("[INDEX] CONTROLFILE_URL no configurada")
      return NextResponse.json(
        { error: "Configuración del backend no disponible" },
        { status: 500 }
      )
    }

    const backendUrl = `${controlFileUrl}/api/repository/index`
    console.log(`[INDEX] Enviando request a ControlFile: ${backendUrl}`)

    try {
      const backendResponse = await fetch(backendUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          owner,
          repo,
          branch: branch || "main",
          uid,
        }),
      })

      const responseData = await backendResponse.json()
      console.log(`[INDEX] Respuesta de ControlFile: ${backendResponse.status}`)

      // 5) Retornar respuesta del backend
      return NextResponse.json(responseData, {
        status: backendResponse.status,
      })
    } catch (fetchError) {
      console.error("[INDEX] Error al comunicarse con ControlFile:", fetchError)
      return NextResponse.json(
        {
          error: "Error al comunicarse con el backend de indexación",
          details: fetchError instanceof Error ? fetchError.message : "Error desconocido",
        },
        { status: 502 }
      )
    }
  } catch (error) {
    console.error("[INDEX] ===== Error en POST /api/repository/index =====")
    console.error("[INDEX] Error:", error)
    console.error("[INDEX] Stack:", error instanceof Error ? error.stack : "No stack disponible")

    // Determinar el tipo de error para ayudar con el debugging
    let errorType = "UNKNOWN_ERROR"
    let errorMessage = error instanceof Error ? error.message : "Error desconocido"

    if (errorMessage.includes("FIREBASE_SERVICE_ACCOUNT_KEY") || errorMessage.includes("Firebase Admin")) {
      errorType = "FIREBASE_INIT_ERROR"
    } else if (errorMessage.includes("Token inválido") || errorMessage.includes("Authorization")) {
      errorType = "AUTH_ERROR"
    } else if (errorMessage.includes("GitHub")) {
      errorType = "GITHUB_ERROR"
    }

    // Log estructurado para producción
    console.error(JSON.stringify({
      level: "error",
      service: "controlfile-backend",
      environment: process.env.NODE_ENV || "production",
      timestamp: new Date().toISOString(),
      path: "/api/repository/index",
      method: "POST",
      errorType,
      errorMessage: errorMessage.substring(0, 200),
      hasStack: error instanceof Error && !!error.stack,
    }))

    return NextResponse.json(
      {
        error: errorMessage,
        errorType,
      },
      { status: 500 }
    )
  }
}

import { NextRequest, NextResponse } from "next/server"
import { getUserPreferences, updateActiveRepository } from "@/lib/user-preferences/storage"
import { getAuthenticatedUserId } from "@/lib/auth/server-auth"

/**
 * GET /api/user/preferences
 * Obtiene las preferencias del usuario autenticado
 */
export async function GET(request: NextRequest) {
  try {
    // Obtener userId del token autenticado
    const userId = await getAuthenticatedUserId(request)

    // Obtener preferencias
    const preferences = await getUserPreferences(userId)

    // Si no existen, retornar valores por defecto
    if (!preferences) {
      return NextResponse.json(
        {
          userId,
          activeRepositoryId: null,
          updatedAt: null,
        },
        { status: 200 }
      )
    }

    return NextResponse.json(preferences, { status: 200 })
  } catch (error) {
    console.error("Error en GET /api/user/preferences:", error)
    
    // Si es un error de autenticación, retornar 401
    if (error instanceof Error && (
      error.message.includes("Authorization") ||
      error.message.includes("Token inválido") ||
      error.message.includes("token")
    )) {
      return NextResponse.json(
        {
          error: "No autenticado. Token inválido o faltante.",
        },
        { status: 401 }
      )
    }
    
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Error desconocido",
      },
      { status: 500 }
    )
  }
}

/**
 * POST /api/user/preferences
 * Actualiza las preferencias del usuario autenticado
 */
export async function POST(request: NextRequest) {
  try {
    // Obtener userId del token autenticado
    const userId = await getAuthenticatedUserId(request)

    const body = await request.json()
    const { activeRepositoryId } = body

    // Validar activeRepositoryId (puede ser null o string)
    if (activeRepositoryId !== null && (typeof activeRepositoryId !== "string" || !activeRepositoryId.trim())) {
      return NextResponse.json(
        { error: "activeRepositoryId debe ser null o un string no vacío" },
        { status: 400 }
      )
    }

    // Actualizar preferencias
    await updateActiveRepository(userId, activeRepositoryId || null)

    return NextResponse.json(
      {
        success: true,
        userId,
        activeRepositoryId: activeRepositoryId || null,
      },
      { status: 200 }
    )
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Error desconocido"
    console.error("[API] Error en POST /api/user/preferences:", errorMessage)
    console.error("[API] Error completo:", JSON.stringify({
      level: "error",
      service: "controlrepo-backend",
      component: "api-user-preferences",
      operation: "POST",
      errorType: error instanceof Error ? error.constructor.name : typeof error,
      errorMessage,
      timestamp: new Date().toISOString(),
    }))
    
    // Si es un error de autenticación, retornar 401
    if (error instanceof Error && (
      error.message.includes("Authorization") ||
      error.message.includes("Token inválido") ||
      error.message.includes("token") ||
      error.message.includes("autenticado")
    )) {
      return NextResponse.json(
        {
          error: "No autenticado. Token inválido o faltante.",
        },
        { status: 401 }
      )
    }
    
    // Si es un error relacionado con la creación del documento usuario, devolver error controlado
    if (error instanceof Error && error.message.includes("Error al crear documento base del usuario")) {
      return NextResponse.json(
        {
          error: "Error al inicializar usuario. Por favor, intente nuevamente.",
          details: errorMessage,
        },
        { status: 500 }
      )
    }
    
    // Si es un error relacionado con guardar preferencias, devolver error controlado
    if (error instanceof Error && error.message.includes("Error al guardar preferencias")) {
      return NextResponse.json(
        {
          error: "Error al guardar preferencias. Por favor, intente nuevamente.",
          details: errorMessage,
        },
        { status: 500 }
      )
    }
    
    // Error genérico
    return NextResponse.json(
      {
        error: "Error al procesar la solicitud.",
        details: errorMessage,
      },
      { status: 500 }
    )
  }
}








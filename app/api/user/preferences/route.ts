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
  let userId: string | null = null
  
  try {
    // Obtener userId del token autenticado
    try {
      userId = await getAuthenticatedUserId(request)
      console.log(`[API] POST /api/user/preferences - Usuario autenticado: ${userId}`)
    } catch (authError) {
      const authErrorMessage = authError instanceof Error ? authError.message : "Error desconocido"
      console.error("[API] Error de autenticación en POST /api/user/preferences:", authErrorMessage)
      console.error("[API] Error de autenticación completo:", JSON.stringify({
        level: "error",
        service: "controlrepo-backend",
        component: "api-user-preferences",
        operation: "POST",
        step: "authentication",
        errorType: authError instanceof Error ? authError.constructor.name : typeof authError,
        errorMessage: authErrorMessage,
        errorStack: authError instanceof Error ? authError.stack : undefined,
        timestamp: new Date().toISOString(),
      }))
      
      return NextResponse.json(
        {
          error: "No autenticado. Token inválido o faltante.",
          details: authErrorMessage,
        },
        { status: 401 }
      )
    }

    // Parsear body
    let body: any
    try {
      body = await request.json()
    } catch (parseError) {
      console.error("[API] Error al parsear body en POST /api/user/preferences:", parseError)
      return NextResponse.json(
        { error: "Body inválido. Se espera JSON." },
        { status: 400 }
      )
    }

    const { activeRepositoryId } = body

    // Validar activeRepositoryId (puede ser null o string)
    if (activeRepositoryId !== null && (typeof activeRepositoryId !== "string" || !activeRepositoryId.trim())) {
      return NextResponse.json(
        { error: "activeRepositoryId debe ser null o un string no vacío" },
        { status: 400 }
      )
    }

    console.log(`[API] POST /api/user/preferences - Actualizando preferencias para usuario ${userId}, activeRepositoryId: ${activeRepositoryId || "null"}`)

    // Actualizar preferencias
    try {
      await updateActiveRepository(userId, activeRepositoryId || null)
      console.log(`[API] POST /api/user/preferences - Preferencias actualizadas exitosamente para usuario ${userId}`)
    } catch (updateError) {
      const updateErrorMessage = updateError instanceof Error ? updateError.message : "Error desconocido"
      console.error(`[API] Error al actualizar preferencias para usuario ${userId}:`, updateErrorMessage)
      console.error(`[API] Error al actualizar preferencias completo:`, JSON.stringify({
        level: "error",
        service: "controlrepo-backend",
        component: "api-user-preferences",
        operation: "POST",
        step: "updatePreferences",
        userId,
        errorType: updateError instanceof Error ? updateError.constructor.name : typeof updateError,
        errorMessage: updateErrorMessage,
        errorStack: updateError instanceof Error ? updateError.stack : undefined,
        timestamp: new Date().toISOString(),
      }))
      throw updateError
    }

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
    const errorCode = (error as any)?.code || "UNKNOWN"
    const errorDetails = (error as any)?.details || null
    
    console.error("[API] Error en POST /api/user/preferences:", errorMessage)
    console.error("[API] Error completo:", JSON.stringify({
      level: "error",
      service: "controlrepo-backend",
      component: "api-user-preferences",
      operation: "POST",
      userId: userId || "UNKNOWN",
      errorCode,
      errorDetails,
      errorType: error instanceof Error ? error.constructor.name : typeof error,
      errorMessage,
      errorStack: error instanceof Error ? error.stack : undefined,
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








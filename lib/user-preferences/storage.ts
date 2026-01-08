/**
 * Persistencia de preferencias de usuario usando Firestore
 * Almacena el repositorio activo por usuario
 * Namespace: /apps/controlrepo/users/{userId}/preferences
 */

import { initializeFirebaseAdmin } from "@/lib/auth/server-auth"
import { FieldValue } from "firebase-admin/firestore"

/**
 * Asegura que el documento base del usuario exista en Firestore
 * Crea el documento con metadata mínima si no existe (operación idempotente)
 * 
 * @param userId - ID del usuario
 * @throws Error si falla la creación del documento usuario
 */
async function ensureUserDocumentExists(userId: string): Promise<void> {
  const { db } = initializeFirebaseAdmin()

  const userPath = `apps/controlrepo/users/${userId}`
  const userRef = db.doc(userPath)
  
  try {
    // Verificar si el documento existe
    const userDoc = await userRef.get()
    
    if (userDoc.exists) {
      // Ya existe, operación idempotente completada
      return
    }
    
    // Crear documento con metadata mínima y segura
    // Usar set con merge: true para evitar errores si se crea entre get y set (race condition)
    await userRef.set({
      uid: userId,
      createdAt: FieldValue.serverTimestamp(),
      initializedBy: "api/user/preferences",
      appId: "controlrepo",
    }, { merge: true })
    
    console.log(`[USER-PREFERENCES] Documento usuario creado: ${userPath}`)
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Error desconocido"
    const errorCode = (error as any)?.code || "UNKNOWN"
    
    // Si el error es porque el documento ya existe o fue creado concurrentemente, ignorarlo (idempotente)
    // Firestore puede devolver errores específicos en condiciones de carrera, pero generalmente
    // el merge: true previene estos errores. Sin embargo, verificamos por si acaso.
    if (errorCode.includes("already-exists") || errorCode.includes("ALREADY_EXISTS")) {
      console.log(`[USER-PREFERENCES] Documento usuario ya existe (creado concurrentemente): ${userPath}`)
      return
    }
    
    console.error(`[USER-PREFERENCES] Error al crear documento usuario ${userId}:`, errorMessage)
    console.error(`[USER-PREFERENCES] Error completo:`, JSON.stringify({
      level: "error",
      service: "controlrepo-backend",
      component: "user-preferences-storage",
      operation: "ensureUserDocumentExists",
      userId,
      userPath,
      errorCode,
      errorType: error instanceof Error ? error.constructor.name : typeof error,
      errorMessage,
      timestamp: new Date().toISOString(),
    }))
    
    // Lanzar error explícito para que el caller pueda manejarlo
    throw new Error(`Error al crear documento base del usuario (${errorCode}): ${errorMessage}`)
  }
}

export interface UserPreferences {
  userId: string
  activeRepositoryId: string | null
  updatedAt: string
}

/**
 * Obtiene las preferencias de un usuario desde Firestore
 */
export async function getUserPreferences(userId: string): Promise<UserPreferences | null> {
  const { db } = initializeFirebaseAdmin()

  try {
    const docPath = `apps/controlrepo/users/${userId}/preferences`
    const docRef = db.doc(docPath)
    const doc = await docRef.get()

    if (!doc.exists) {
      return null
    }

    const data = doc.data()
    if (!data) {
      return null
    }

    return {
      userId,
      activeRepositoryId: data.activeRepositoryId || null,
      updatedAt: data.updatedAt?.toDate?.()?.toISOString() || data.updatedAt || new Date().toISOString(),
    }
  } catch (error) {
    console.error(`Error al leer preferencias de usuario ${userId}:`, error)
    return null
  }
}

/**
 * Guarda las preferencias de un usuario en Firestore
 * Asegura que el documento usuario exista antes de escribir preferencias
 */
export async function saveUserPreferences(preferences: UserPreferences): Promise<void> {
  // Asegurar que el documento usuario exista antes de escribir preferencias
  await ensureUserDocumentExists(preferences.userId)

  const { db } = initializeFirebaseAdmin()

  try {
    const docPath = `apps/controlrepo/users/${preferences.userId}/preferences`
    const docRef = db.doc(docPath)

    await docRef.set({
      activeRepositoryId: preferences.activeRepositoryId,
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true })
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Error desconocido"
    console.error(`[USER-PREFERENCES] Error al guardar preferencias de usuario ${preferences.userId}:`, errorMessage)
    console.error(`[USER-PREFERENCES] Error completo:`, JSON.stringify({
      level: "error",
      service: "controlrepo-backend",
      component: "user-preferences-storage",
      operation: "saveUserPreferences",
      userId: preferences.userId,
      errorType: error instanceof Error ? error.constructor.name : typeof error,
      errorMessage,
      timestamp: new Date().toISOString(),
    }))
    
    // Lanzar error explícito
    throw new Error(`Error al guardar preferencias: ${errorMessage}`)
  }
}

/**
 * Actualiza el repositorio activo de un usuario
 */
export async function updateActiveRepository(userId: string, repositoryId: string | null): Promise<void> {
  const preferences: UserPreferences = {
    userId,
    activeRepositoryId: repositoryId,
    updatedAt: new Date().toISOString(),
  }

  await saveUserPreferences(preferences)
}


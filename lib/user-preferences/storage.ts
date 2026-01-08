/**
 * Persistencia de preferencias de usuario usando Firestore
 * Almacena el repositorio activo por usuario
 * Namespace: /apps/controlrepo/users/{userId}/preferences
 */

import { initializeFirebaseAdmin } from "@/lib/auth/server-auth"
import { FieldValue } from "firebase-admin/firestore"

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
 */
export async function saveUserPreferences(preferences: UserPreferences): Promise<void> {
  const { db } = initializeFirebaseAdmin()

  try {
    const docPath = `apps/controlrepo/users/${preferences.userId}/preferences`
    const docRef = db.doc(docPath)

    await docRef.set({
      activeRepositoryId: preferences.activeRepositoryId,
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true })
  } catch (error) {
    console.error(`Error al guardar preferencias de usuario ${preferences.userId}:`, error)
    throw error
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


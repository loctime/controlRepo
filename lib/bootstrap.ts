import { doc, getDoc, setDoc, serverTimestamp } from "firebase/firestore"
import { db } from "./firebase"

/**
 * Inicializa el documento de usuario en /apps/controlrepo/users/{uid}
 * Solo crea metadata básica del usuario.
 * 
 * REGLA ARQUITECTÓNICA:
 * - ControlRepo usa /apps/controlrepo/users/{uid} como raíz del usuario
 * - NO inicializa carpetas (eso es responsabilidad de ControlFile API)
 * - NO escribe en /apps/controlfile/**
 * - Solo metadata básica del usuario
 */
export async function initializeUserDocument(uid: string, email: string | null = null): Promise<void> {
  if (typeof window === "undefined" || !db) return

  // Namespace obligatorio: /apps/controlrepo/users/{uid}
  const userPath = `apps/controlrepo/users/${uid}`
  const userRef = doc(db, userPath)

  try {
    const userDoc = await getDoc(userRef)

    // Solo crear si no existe (idempotente)
    if (!userDoc.exists()) {
      await setDoc(userRef, {
        email: email || null,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      })
    }
  } catch (error) {
    // Tolerante a errores: no bloquea el login
    console.error("Error al inicializar documento de usuario:", error)
  }
}


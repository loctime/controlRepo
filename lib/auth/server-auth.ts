/**
 * Utilidades de autenticación para el servidor (API routes)
 * Usa firebase-admin para verificar tokens de Firebase Auth
 */

import { initializeApp, getApps, cert, App } from "firebase-admin/app"
import { getAuth, Auth } from "firebase-admin/auth"
import { getFirestore, Firestore } from "firebase-admin/firestore"

let app: App | undefined
let auth: Auth | undefined
let db: Firestore | undefined

/**
 * Inicializa Firebase Admin SDK
 */
function initializeFirebaseAdmin(): { auth: Auth; db: Firestore } {
  if (auth && db) {
    return { auth, db }
  }

  // Verificar si ya está inicializado
  if (getApps().length > 0) {
    app = getApps()[0]
    auth = getAuth(app)
    db = getFirestore(app)
    return { auth, db }
  }

  // Inicializar con credenciales desde variables de entorno
  // Para producción, usar GOOGLE_APPLICATION_CREDENTIALS o service account JSON
  const serviceAccount = process.env.FIREBASE_SERVICE_ACCOUNT_KEY
    ? JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY)
    : undefined

  if (!serviceAccount && !process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    // En desarrollo, intentar usar las credenciales del proyecto
    // Si no están disponibles, usar emulador o fallback
    console.warn(
      "⚠️ FIREBASE_SERVICE_ACCOUNT_KEY o GOOGLE_APPLICATION_CREDENTIALS no configurado. " +
      "Usando inicialización con projectId solamente."
    )

    const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID
    if (!projectId) {
      throw new Error(
        "NEXT_PUBLIC_FIREBASE_PROJECT_ID no está configurado. " +
        "Necesitas configurar Firebase Admin SDK."
      )
    }

    app = initializeApp({
      projectId,
    })
  } else if (serviceAccount) {
    app = initializeApp({
      credential: cert(serviceAccount),
    })
  } else {
    // Usar GOOGLE_APPLICATION_CREDENTIALS
    app = initializeApp()
  }

  auth = getAuth(app)
  db = getFirestore(app)

  return { auth, db }
}

/**
 * Verifica un token de Firebase ID y retorna el UID del usuario
 * @param idToken Token de Firebase ID (Bearer token)
 * @returns UID del usuario autenticado
 * @throws Error si el token es inválido o no se puede verificar
 */
export async function verifyFirebaseIdToken(idToken: string): Promise<string> {
  const { auth } = initializeFirebaseAdmin()

  try {
    const decodedToken = await auth.verifyIdToken(idToken)
    return decodedToken.uid
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(`Token inválido: ${error.message}`)
    }
    throw new Error("Error al verificar token")
  }
}

/**
 * Obtiene el access_token de GitHub del usuario desde Firestore
 * @param uid UID del usuario
 * @returns access_token de GitHub o null si no existe
 */
export async function getGitHubAccessToken(uid: string): Promise<string | null> {
  const { db } = initializeFirebaseAdmin()

  try {
    const docRef = db.collection("githubIntegrations").doc(uid)
    const doc = await docRef.get()

    if (!doc.exists) {
      return null
    }

    const data = doc.data()
    return data?.access_token || null
  } catch (error) {
    console.error(`Error al obtener access_token para usuario ${uid}:`, error)
    throw error
  }
}

/**
 * Extrae y verifica el token Bearer del header Authorization
 * @param request Request de Next.js
 * @returns UID del usuario autenticado
 * @throws Error si no hay token o es inválido
 */
export async function getAuthenticatedUserId(
  request: Request
): Promise<string> {
  const authHeader = request.headers.get("authorization")

  if (!authHeader) {
    throw new Error("Header Authorization faltante")
  }

  if (!authHeader.startsWith("Bearer ")) {
    throw new Error("Formato de Authorization inválido. Debe ser: Bearer <token>")
  }

  const idToken = authHeader.substring(7) // Remover "Bearer "
  return await verifyFirebaseIdToken(idToken)
}


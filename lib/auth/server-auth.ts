/**
 * Utilidades de autenticación para el servidor (API routes)
 * Usa firebase-admin para verificar tokens de Firebase Auth
 * 
 * LOGS EN PRODUCCIÓN:
 * - Los logs aparecen en los logs del servidor (Vercel Functions Logs, etc.)
 * - Los logs estructurados (JSON.stringify) facilitan el filtrado
 * - Los logs con prefijo [AUTH] identifican el componente
 * - Los errores de inicialización de Firebase Admin se registran con detalles
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
export function initializeFirebaseAdmin(): { auth: Auth; db: Firestore } {
  // [FIREBASE ENV CHECK] - Verificar variable de entorno SIEMPRE (incluso si ya está inicializado)
  const envCheckKey = process.env.FIREBASE_SERVICE_ACCOUNT_KEY
  console.log("[FIREBASE ENV CHECK]", {
    exists: !!envCheckKey,
    type: typeof envCheckKey,
    previewStart: envCheckKey ? envCheckKey.substring(0, 30) : null,
    previewEnd: envCheckKey && envCheckKey.length > 30 ? envCheckKey.substring(envCheckKey.length - 30) : null,
  })

  // Log: Verificar si ya está inicializado en memoria
  if (auth && db) {
    console.log("[AUTH] Firebase Admin ya inicializado en memoria, reutilizando instancia")
    return { auth, db }
  }

  // Log: Verificar si ya está inicializado en getApps()
  const existingApps = getApps()
  if (existingApps.length > 0) {
    console.log(`[AUTH] Firebase Admin ya inicializado en getApps() (${existingApps.length} app(s)), reutilizando`)
    // Si hay múltiples apps, loguear advertencia
    if (existingApps.length > 1) {
      console.warn(`[AUTH] ⚠️ ADVERTENCIA: Se encontraron ${existingApps.length} apps de Firebase Admin. Usando la primera.`)
      console.warn(JSON.stringify({
        level: "warn",
        service: "controlfile-backend",
        component: "firebase-admin-init",
        warning: "MULTIPLE_APPS_DETECTED",
        appCount: existingApps.length,
        timestamp: new Date().toISOString(),
      }))
    }
    app = existingApps[0]
    auth = getAuth(app)
    db = getFirestore(app)
    return { auth, db }
  }

  // Log: Verificar existencia de FIREBASE_SERVICE_ACCOUNT_KEY
  const serviceAccountKey = process.env.FIREBASE_SERVICE_ACCOUNT_KEY
  console.log("[AUTH] Verificando configuración de Firebase Admin SDK...")
  console.log(`[AUTH] FIREBASE_SERVICE_ACCOUNT_KEY existe: ${!!serviceAccountKey}`)
  console.log(`[AUTH] FIREBASE_SERVICE_ACCOUNT_KEY longitud: ${serviceAccountKey?.length || 0}`)
  console.log(`[AUTH] GOOGLE_APPLICATION_CREDENTIALS existe: ${!!process.env.GOOGLE_APPLICATION_CREDENTIALS}`)
  
  // Log estructurado para producción
  console.log(JSON.stringify({
    level: "info",
    service: "controlfile-backend",
    environment: process.env.NODE_ENV || "production",
    timestamp: new Date().toISOString(),
    component: "firebase-admin-init",
    hasServiceAccountKey: !!serviceAccountKey,
    serviceAccountKeyLength: serviceAccountKey?.length || 0,
    hasGoogleCredentials: !!process.env.GOOGLE_APPLICATION_CREDENTIALS,
  }))

  // Inicializar con credenciales desde variables de entorno
  // Para producción, usar GOOGLE_APPLICATION_CREDENTIALS o service account JSON
  let serviceAccount: any = undefined
  
  if (serviceAccountKey) {
    try {
      console.log("[AUTH] Intentando parsear FIREBASE_SERVICE_ACCOUNT_KEY como JSON...")
      serviceAccount = JSON.parse(serviceAccountKey)
      console.log("[AUTH] ✅ JSON parseado correctamente")
      console.log(`[AUTH] Service Account project_id: ${serviceAccount?.project_id || "NO ENCONTRADO"}`)
    } catch (parseError) {
      console.error("[AUTH] ❌ Error al parsear FIREBASE_SERVICE_ACCOUNT_KEY:", parseError)
      console.error(`[AUTH] Primeros 100 caracteres del valor: ${serviceAccountKey.substring(0, 100)}...`)
      
      // Log estructurado para producción
      console.error(JSON.stringify({
        level: "error",
        service: "controlfile-backend",
        environment: process.env.NODE_ENV || "production",
        timestamp: new Date().toISOString(),
        component: "firebase-admin-init",
        errorType: "JSON_PARSE_ERROR",
        errorMessage: parseError instanceof Error ? parseError.message : "Error desconocido al parsear JSON",
        serviceAccountKeyPreview: serviceAccountKey.substring(0, 100),
      }))
      
      throw new Error(
        `Error al parsear FIREBASE_SERVICE_ACCOUNT_KEY como JSON: ${parseError instanceof Error ? parseError.message : "Error desconocido"}`
      )
    }
  }

  if (!serviceAccount && !process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    // En producción, las credenciales son REQUERIDAS
    const isProduction = process.env.NODE_ENV === "production"
    
    if (isProduction) {
      console.error("[AUTH] ❌ PRODUCCIÓN: Credenciales de Firebase Admin REQUERIDAS")
      console.error(JSON.stringify({
        level: "error",
        service: "controlfile-backend",
        environment: "production",
        timestamp: new Date().toISOString(),
        component: "firebase-admin-init",
        errorType: "MISSING_CREDENTIALS",
        errorMessage: "FIREBASE_SERVICE_ACCOUNT_KEY o GOOGLE_APPLICATION_CREDENTIALS deben estar configurados en producción",
        hasServiceAccountKey: !!serviceAccountKey,
        hasGoogleCredentials: !!process.env.GOOGLE_APPLICATION_CREDENTIALS,
      }))
      throw new Error(
        "Firebase Admin SDK requiere credenciales en producción. " +
        "Configura FIREBASE_SERVICE_ACCOUNT_KEY o GOOGLE_APPLICATION_CREDENTIALS."
      )
    }

    // En desarrollo, intentar usar las credenciales del proyecto
    // Si no están disponibles, usar emulador o fallback
    console.warn(
      "[AUTH] ⚠️ FIREBASE_SERVICE_ACCOUNT_KEY o GOOGLE_APPLICATION_CREDENTIALS no configurado. " +
      "Usando inicialización con projectId solamente (solo para desarrollo)."
    )

    const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID
    if (!projectId) {
      console.error("[AUTH] ❌ NEXT_PUBLIC_FIREBASE_PROJECT_ID no está configurado")
      throw new Error(
        "NEXT_PUBLIC_FIREBASE_PROJECT_ID no está configurado. " +
        "Necesitas configurar Firebase Admin SDK."
      )
    }

    console.log(`[AUTH] Inicializando Firebase Admin con projectId: ${projectId} (SOLO DESARROLLO)`)
    // [FIREBASE ENV CHECK]
    const envCheckKey = process.env.FIREBASE_SERVICE_ACCOUNT_KEY
    console.log("[FIREBASE ENV CHECK]", {
      exists: !!envCheckKey,
      type: typeof envCheckKey,
      previewStart: envCheckKey ? envCheckKey.substring(0, 30) : null,
      previewEnd: envCheckKey && envCheckKey.length > 30 ? envCheckKey.substring(envCheckKey.length - 30) : null,
    })
    try {
      app = initializeApp({
        projectId,
      })
      console.log("[AUTH] ✅ Firebase Admin inicializado con projectId (NOTA: Firestore puede no funcionar sin credenciales)")
    } catch (initError) {
      console.error("[AUTH] ❌ Error al inicializar Firebase Admin con projectId:", initError)
      console.error(JSON.stringify({
        level: "error",
        service: "controlfile-backend",
        environment: process.env.NODE_ENV || "production",
        timestamp: new Date().toISOString(),
        component: "firebase-admin-init",
        errorType: "INIT_ERROR",
        initMethod: "projectId",
        errorMessage: initError instanceof Error ? initError.message : "Error desconocido",
      }))
      throw initError
    }
  } else if (serviceAccount) {
    console.log("[AUTH] Inicializando Firebase Admin con service account...")
    // [FIREBASE ENV CHECK]
    const envCheckKey = process.env.FIREBASE_SERVICE_ACCOUNT_KEY
    console.log("[FIREBASE ENV CHECK]", {
      exists: !!envCheckKey,
      type: typeof envCheckKey,
      previewStart: envCheckKey ? envCheckKey.substring(0, 30) : null,
      previewEnd: envCheckKey && envCheckKey.length > 30 ? envCheckKey.substring(envCheckKey.length - 30) : null,
    })
    try {
      app = initializeApp({
        credential: cert(serviceAccount),
      })
      console.log("[AUTH] ✅ Firebase Admin inicializado con service account")
      console.log(JSON.stringify({
        level: "info",
        service: "controlfile-backend",
        environment: process.env.NODE_ENV || "production",
        timestamp: new Date().toISOString(),
        component: "firebase-admin-init",
        initMethod: "serviceAccount",
        status: "success",
      }))
    } catch (initError) {
      console.error("[AUTH] ❌ Error al inicializar Firebase Admin con service account:", initError)
      console.error(JSON.stringify({
        level: "error",
        service: "controlfile-backend",
        environment: process.env.NODE_ENV || "production",
        timestamp: new Date().toISOString(),
        component: "firebase-admin-init",
        errorType: "INIT_ERROR",
        initMethod: "serviceAccount",
        errorMessage: initError instanceof Error ? initError.message : "Error desconocido",
      }))
      throw initError
    }
  } else {
    // Usar GOOGLE_APPLICATION_CREDENTIALS
    console.log("[AUTH] Inicializando Firebase Admin con GOOGLE_APPLICATION_CREDENTIALS...")
    // [FIREBASE ENV CHECK]
    const envCheckKey = process.env.FIREBASE_SERVICE_ACCOUNT_KEY
    console.log("[FIREBASE ENV CHECK]", {
      exists: !!envCheckKey,
      type: typeof envCheckKey,
      previewStart: envCheckKey ? envCheckKey.substring(0, 30) : null,
      previewEnd: envCheckKey && envCheckKey.length > 30 ? envCheckKey.substring(envCheckKey.length - 30) : null,
    })
    try {
      app = initializeApp()
      console.log("[AUTH] ✅ Firebase Admin inicializado con GOOGLE_APPLICATION_CREDENTIALS")
      console.log(JSON.stringify({
        level: "info",
        service: "controlfile-backend",
        environment: process.env.NODE_ENV || "production",
        timestamp: new Date().toISOString(),
        component: "firebase-admin-init",
        initMethod: "GOOGLE_APPLICATION_CREDENTIALS",
        status: "success",
      }))
    } catch (initError) {
      console.error("[AUTH] ❌ Error al inicializar Firebase Admin con GOOGLE_APPLICATION_CREDENTIALS:", initError)
      console.error(JSON.stringify({
        level: "error",
        service: "controlfile-backend",
        environment: process.env.NODE_ENV || "production",
        timestamp: new Date().toISOString(),
        component: "firebase-admin-init",
        errorType: "INIT_ERROR",
        initMethod: "GOOGLE_APPLICATION_CREDENTIALS",
        errorMessage: initError instanceof Error ? initError.message : "Error desconocido",
      }))
      throw initError
    }
  }

  try {
    auth = getAuth(app)
    db = getFirestore(app)
    console.log("[AUTH] ✅ Auth y Firestore obtenidos exitosamente")
    
    // Nota: La verificación de credenciales se hará cuando se use Firestore por primera vez
    // Si hay un problema de credenciales, se detectará en getGitHubAccessToken u otras operaciones
    // y se manejará apropiadamente
    
    return { auth, db }
  } catch (error) {
    console.error("[AUTH] ❌ Error al obtener Auth o Firestore:", error)
    console.error(JSON.stringify({
      level: "error",
      service: "controlfile-backend",
      environment: process.env.NODE_ENV || "production",
      timestamp: new Date().toISOString(),
      component: "firebase-admin-init",
      errorType: "AUTH_FIRESTORE_ERROR",
      errorMessage: error instanceof Error ? error.message : "Error desconocido",
    }))
    throw error
  }
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
    // Buscar en la estructura correcta: /apps/controlrepo/{uid}/githubIntegration
    const docPath = `apps/controlrepo/${uid}/githubIntegration`
    console.log(`[AUTH] Buscando GitHub integration en '${docPath}' para usuario ${uid}`)
    const docRef = db.doc(docPath)
    const doc = await docRef.get()

    if (!doc.exists) {
      console.log(`[AUTH] GitHub integration no encontrada para usuario ${uid}`)
      console.log(JSON.stringify({
        level: "info",
        service: "controlfile-backend",
        environment: process.env.NODE_ENV || "production",
        timestamp: new Date().toISOString(),
        component: "getGitHubAccessToken",
        userId: uid,
        documentPath: docPath,
        documentExists: false,
        message: "GitHub integration no encontrada",
      }))
      return null
    }

    const data = doc.data()
    console.log(`[AUTH] Documento encontrado. Campos disponibles: ${Object.keys(data || {}).join(", ")}`)
    const token = data?.access_token || null
    
    if (!token) {
      console.log(`[AUTH] access_token no encontrado en documento de GitHub para usuario ${uid}`)
      console.log(JSON.stringify({
        level: "warn",
        service: "controlfile-backend",
        environment: process.env.NODE_ENV || "production",
        timestamp: new Date().toISOString(),
        component: "getGitHubAccessToken",
        userId: uid,
        documentExists: true,
        hasAccessTokenField: "access_token" in (data || {}),
        dataKeys: Object.keys(data || {}),
        message: "access_token no encontrado en documento",
      }))
    } else {
      console.log(`[AUTH] access_token obtenido para usuario ${uid} (longitud: ${token.length})`)
      console.log(JSON.stringify({
        level: "info",
        service: "controlfile-backend",
        environment: process.env.NODE_ENV || "production",
        timestamp: new Date().toISOString(),
        component: "getGitHubAccessToken",
        userId: uid,
        tokenLength: token.length,
        message: "access_token obtenido exitosamente",
      }))
    }
    
    return token
  } catch (error) {
    // Log detallado del error
    console.error(`[AUTH] Error al obtener access_token para usuario ${uid}:`, error)
    console.error(JSON.stringify({
      level: "error",
      service: "controlfile-backend",
      environment: process.env.NODE_ENV || "production",
      timestamp: new Date().toISOString(),
      component: "getGitHubAccessToken",
      errorType: "FIRESTORE_ERROR",
      errorMessage: error instanceof Error ? error.message : "Error desconocido",
      userId: uid,
    }))
    
    // En lugar de lanzar el error, devolver null para que el endpoint pueda manejar
    // el caso de "GitHub no conectado" con un 400 en lugar de un 500
    // Solo lanzar si es un error crítico de autenticación
    if (error instanceof Error) {
      const errorMessage = error.message.toLowerCase()
      // Si es un error de permisos o autenticación de Firestore, sí lanzar
      if (errorMessage.includes("permission") || 
          errorMessage.includes("unauthorized") ||
          errorMessage.includes("unauthenticated")) {
        throw error
      }
    }
    
    // Para otros errores (red, timeout, etc.), devolver null
    // El endpoint manejará esto como "GitHub no conectado"
    console.warn(`[AUTH] Devolviendo null debido a error no crítico al obtener access_token para usuario ${uid}`)
    return null
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


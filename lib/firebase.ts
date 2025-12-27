import { initializeApp, getApps, FirebaseApp } from "firebase/app"
import { getAuth, Auth } from "firebase/auth"
import { getFirestore, Firestore } from "firebase/firestore"

// En Next.js, las variables NEXT_PUBLIC_* están disponibles tanto en servidor como cliente
// Se inyectan en el bundle durante la compilación
const envVars = {
  NEXT_PUBLIC_FIREBASE_API_KEY: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  NEXT_PUBLIC_FIREBASE_PROJECT_ID: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  NEXT_PUBLIC_FIREBASE_APP_ID: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
}

// Log temporal para verificar variables de entorno en producción
console.log('[ENV CHECK]', {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
});

// Validar que todas las variables estén presentes y no estén vacías
const missingVars: string[] = []
const invalidVars: string[] = []

Object.entries(envVars).forEach(([key, value]) => {
  if (!value || typeof value !== "string") {
    missingVars.push(key)
  } else {
    const trimmed = value.trim()
    if (trimmed === "") {
      missingVars.push(key)
    } else if (key === "NEXT_PUBLIC_FIREBASE_API_KEY" && trimmed.length < 20) {
      invalidVars.push(`${key} (valor demasiado corto: "${trimmed.substring(0, 10)}...")`)
    }
  }
})

// Solo mostrar errores en el cliente para evitar ruido en el servidor
if (typeof window !== "undefined") {
  if (missingVars.length > 0) {
    // Debug: mostrar qué variables están disponibles en process.env
    const allProcessEnvKeys = typeof process !== "undefined" && process.env 
      ? Object.keys(process.env).filter(k => k.startsWith("NEXT_PUBLIC_"))
      : []
    
    console.error(
      `❌ Error de configuración de Firebase: Las siguientes variables de entorno faltan o están vacías:\n${missingVars.join('\n')}\n\n` +
      `🔍 Debug: Variables NEXT_PUBLIC_* encontradas en process.env: ${allProcessEnvKeys.length > 0 ? allProcessEnvKeys.join(', ') : 'NINGUNA (esto indica que el servidor necesita reiniciarse)'}\n\n` +
      `📝 Solución:\n` +
      `   1. Verifica que el archivo .env.local existe en la raíz del proyecto\n` +
      `   2. Detén completamente el servidor (Ctrl+C en la terminal donde corre)\n` +
      `   3. Elimina la carpeta .next: rmdir /s /q .next (en PowerShell: Remove-Item -Recurse -Force .next)\n` +
      `   4. Reinicia el servidor: pnpm dev\n\n` +
      `💡 Nota: Las variables NEXT_PUBLIC_* solo se cargan cuando se inicia el servidor.`
    )
  }
  if (invalidVars.length > 0) {
    console.error(
      `❌ Error de configuración de Firebase: Las siguientes variables tienen valores inválidos:\n${invalidVars.join('\n')}\n\n` +
      `Por favor, verifica que los valores sean correctos y no tengan espacios adicionales o caracteres inválidos.`
    )
  }
}

// Limpiar y preparar la configuración (eliminar espacios en blanco)
const firebaseConfig = {
  apiKey: envVars.NEXT_PUBLIC_FIREBASE_API_KEY?.trim() || "",
  authDomain: envVars.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN?.trim() || "",
  projectId: envVars.NEXT_PUBLIC_FIREBASE_PROJECT_ID?.trim() || "",
  storageBucket: envVars.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET?.trim() || "",
  messagingSenderId: envVars.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID?.trim() || "",
  appId: envVars.NEXT_PUBLIC_FIREBASE_APP_ID?.trim() || "",
}

let app: FirebaseApp | undefined
let auth: Auth | undefined
let db: Firestore | undefined

if (typeof window !== "undefined" && missingVars.length === 0) {
  try {
    if (!getApps().length) {
      app = initializeApp(firebaseConfig)
    } else {
      app = getApps()[0]
    }
    auth = getAuth(app)
    db = getFirestore(app)
  } catch (error) {
    console.error("❌ Error al inicializar Firebase:", error)
  }
}

export { auth, db }
export default app


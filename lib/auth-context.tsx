"use client"

import React, { createContext, useContext, useEffect, useState, useRef } from "react"
import { User, onAuthStateChanged, signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut } from "firebase/auth"
import { auth } from "./firebase"
import { initializeUserDocument } from "./bootstrap"
import { ensureAccount } from "./auth/ensure-account"

interface AuthContextType {
  user: User | null
  loading: boolean
  login: (email: string, password: string) => Promise<void>
  register: (email: string, password: string) => Promise<void>
  logout: () => Promise<void>
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  // Ref para trackear el UID del usuario para el cual ya se ejecutó ensureAccount
  const ensuredAccountRef = useRef<string | null>(null)

  useEffect(() => {
    if (!auth) {
      setLoading(false)
      return
    }

    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        setUser(firebaseUser)
        
        // Asegurar cuenta global en ControlFile (idempotente, una vez por usuario)
        if (ensuredAccountRef.current !== firebaseUser.uid) {
          ensuredAccountRef.current = firebaseUser.uid
          // Ejecutar en background, no bloquear renderizado
          firebaseUser.getIdToken()
            .then((idToken) => ensureAccount(idToken, firebaseUser.uid))
            .catch((error) => {
              // Error al obtener token - no bloquear, solo loguear
              console.warn(`[AuthProvider] ⚠️ Error al obtener token para ensureAccount (UID: ${firebaseUser.uid}):`, error)
            })
        }
      } else {
        setUser(null)
        // Resetear ref cuando el usuario cierra sesión
        ensuredAccountRef.current = null
      }
      setLoading(false)
    })

    return () => unsubscribe()
  }, [])

  const login = async (email: string, password: string) => {
    if (!auth) throw new Error("Firebase Auth no está inicializado")
    const userCredential = await signInWithEmailAndPassword(auth, email, password)
    
    // Asegurar cuenta global en ControlFile después de login exitoso
    // Ejecutar en background, no bloquear el flujo de login
    const firebaseUser = userCredential.user
    if (ensuredAccountRef.current !== firebaseUser.uid) {
      ensuredAccountRef.current = firebaseUser.uid
      console.log(`[AuthProvider] 🔐 Login exitoso, asegurando cuenta global (UID: ${firebaseUser.uid})`)
      firebaseUser.getIdToken()
        .then((idToken) => ensureAccount(idToken, firebaseUser.uid))
        .catch((error) => {
          // Error al obtener token - no bloquear, solo loguear
          console.warn(`[AuthProvider] ⚠️ Error al obtener token para ensureAccount después de login (UID: ${firebaseUser.uid}):`, error)
        })
    }
  }

  const register = async (email: string, password: string) => {
    if (!auth) throw new Error("Firebase Auth no está inicializado")
    const userCredential = await createUserWithEmailAndPassword(auth, email, password)
    // Inicializar documento de usuario solo en /apps/controlrepo/users/{uid}
    // La inicialización de carpetas es responsabilidad exclusiva de ControlFile API
    await initializeUserDocument(userCredential.user.uid, email)
    
    // Asegurar cuenta global en ControlFile después de registro exitoso
    // Ejecutar en background, no bloquear el flujo de registro
    const firebaseUser = userCredential.user
    if (ensuredAccountRef.current !== firebaseUser.uid) {
      ensuredAccountRef.current = firebaseUser.uid
      console.log(`[AuthProvider] 📝 Registro exitoso, asegurando cuenta global (UID: ${firebaseUser.uid})`)
      firebaseUser.getIdToken()
        .then((idToken) => ensureAccount(idToken, firebaseUser.uid))
        .catch((error) => {
          // Error al obtener token - no bloquear, solo loguear
          console.warn(`[AuthProvider] ⚠️ Error al obtener token para ensureAccount después de registro (UID: ${firebaseUser.uid}):`, error)
        })
    }
  }

  const logout = async () => {
    if (!auth) throw new Error("Firebase Auth no está inicializado")
    await signOut(auth)
    // Resetear ref cuando el usuario cierra sesión
    ensuredAccountRef.current = null
  }

  return <AuthContext.Provider value={{ user, loading, login, register, logout }}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider")
  }
  return context
}


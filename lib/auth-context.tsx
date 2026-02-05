"use client"

import React, { createContext, useContext, useEffect, useState, useRef } from "react"
import { User, onAuthStateChanged, signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut } from "firebase/auth"
import { auth } from "./firebase"
import { initializeUserDocument } from "./bootstrap"

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
  const initializedUserRef = useRef<string | null>(null)

  useEffect(() => {
    if (!auth) {
      setLoading(false)
      return
    }

    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        setUser(firebaseUser)
        
        if (initializedUserRef.current !== firebaseUser.uid) {
          initializedUserRef.current = firebaseUser.uid
        }
      } else {
        setUser(null)
        initializedUserRef.current = null
      }
      setLoading(false)
    })

    return () => unsubscribe()
  }, [])

  const login = async (email: string, password: string) => {
    if (!auth) throw new Error("Firebase Auth no está inicializado")
    const userCredential = await signInWithEmailAndPassword(auth, email, password)
    
    const firebaseUser = userCredential.user
    initializedUserRef.current = firebaseUser.uid
  }

  const register = async (email: string, password: string) => {
    if (!auth) throw new Error("Firebase Auth no está inicializado")
    const userCredential = await createUserWithEmailAndPassword(auth, email, password)
    // Inicializar documento de usuario solo en /apps/controlrepo/users/{uid}
    // La inicialización de carpetas es responsabilidad exclusiva de ControlFile API
    await initializeUserDocument(userCredential.user.uid, email)
    
    const firebaseUser = userCredential.user
    initializedUserRef.current = firebaseUser.uid
  }

  const logout = async () => {
    if (!auth) throw new Error("Firebase Auth no está inicializado")
    await signOut(auth)
    initializedUserRef.current = null
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

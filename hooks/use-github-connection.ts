"use client"

import { useState, useEffect, useCallback } from "react"
import { getAuth } from "firebase/auth"

/**
 * Estados explícitos para la conexión de GitHub
 */
export type GitHubConnectionState = 
  | "not_connected"  // No conectado
  | "connecting"     // Verificando estado
  | "connected"      // Conectado correctamente
  | "error"          // Error al verificar o conectar

export interface GitHubConnectionHook {
  state: GitHubConnectionState
  error: string | null
  checkStatus: () => Promise<void>
  connect: () => Promise<void>
  isChecking: boolean
}

/**
 * Hook para manejar el estado de conexión con GitHub
 * Proporciona estados explícitos y recuperables
 */
export function useGitHubConnection(): GitHubConnectionHook {
  const [state, setState] = useState<GitHubConnectionState>("not_connected")
  const [error, setError] = useState<string | null>(null)
  const [isChecking, setIsChecking] = useState(false)

  /**
   * Verifica el estado de conexión con GitHub
   */
  const checkStatus = useCallback(async () => {
    setIsChecking(true)
    setError(null)
    setState("connecting")

    try {
      const auth = getAuth()
      const user = auth.currentUser

      if (!user) {
        console.log("[GitHub] Usuario no autenticado")
        setState("not_connected")
        setError(null)
        setIsChecking(false)
        return
      }

      const token = await user.getIdToken()

      console.log("[GitHub] Verificando estado de conexión...")

      const res = await fetch(
        `${process.env.NEXT_PUBLIC_CONTROLFILE_URL}/api/github/status`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      )

      console.log("[GitHub] Respuesta del backend:", {
        status: res.status,
        ok: res.ok,
      })

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}))
        const errorMessage = errorData.error || `Error ${res.status}: ${res.statusText}`
        
        console.error("[GitHub] Error al verificar estado:", {
          status: res.status,
          error: errorMessage,
        })

        setState("error")
        setError(errorMessage)
        setIsChecking(false)
        return
      }

      const data = await res.json()
      const isConnected = Boolean(data.connected)

      console.log("[GitHub] Estado recibido:", {
        connected: isConnected,
        data: data,
      })

      if (isConnected) {
        setState("connected")
        setError(null)
      } else {
        setState("not_connected")
        setError(null)
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Error desconocido al verificar GitHub"
      
      console.error("[GitHub] Excepción al verificar estado:", {
        error: errorMessage,
        exception: err,
      })

      setState("error")
      setError(errorMessage)
    } finally {
      setIsChecking(false)
    }
  }, [])

  /**
   * Inicia el flujo de conexión OAuth con GitHub
   */
  const connect = useCallback(async () => {
    try {
      setError(null)
      setState("connecting")

      const auth = getAuth()
      const user = auth.currentUser

      if (!user) {
        const errorMessage = "Usuario no autenticado"
        console.error("[GitHub] Error al conectar:", errorMessage)
        setState("error")
        setError(errorMessage)
        return
      }

      const token = await user.getIdToken()

      console.log("[GitHub] Iniciando flujo OAuth...")

      // Pasar el token como query parameter para el flujo OAuth
      window.location.href =
        `${process.env.NEXT_PUBLIC_CONTROLFILE_URL}/api/auth/github?token=${encodeURIComponent(token)}`
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Error al obtener token para GitHub OAuth"
      
      console.error("[GitHub] Error al conectar:", {
        error: errorMessage,
        exception: err,
      })

      setState("error")
      setError(errorMessage)
    }
  }, [])

  // Verificar estado al montar
  useEffect(() => {
    checkStatus()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []) // Solo ejecutar al montar

  return {
    state,
    error,
    checkStatus,
    connect,
    isChecking,
  }
}

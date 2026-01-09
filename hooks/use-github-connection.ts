"use client"

import { useState, useEffect, useCallback } from "react"
import { getAuth } from "firebase/auth"

/**
 * Estados explícitos para la conexión de GitHub
 * 
 * Nota: "connecting" se usa tanto para verificar estado (checkStatus) como para
 * iniciar OAuth (connect). Semánticamente son diferentes, pero se mantiene unificado
 * para simplicidad. Si se necesita separar en el futuro:
 * - "checking" para GET status
 * - "connecting" para OAuth redirect
 */
export type GitHubConnectionState = 
  | "not_connected"  // No conectado
  | "connecting"     // Verificando estado o iniciando OAuth
  | "connected"      // Conectado correctamente
  | "error"          // Error al verificar o conectar

export interface GitHubConnectionHook {
  state: GitHubConnectionState
  error: string | null
  checkStatus: () => Promise<void>
  connect: () => Promise<void>
  disconnect: () => Promise<void>
  isChecking: boolean
}

/**
 * Hook para manejar el estado de conexión con GitHub
 * Proporciona estados explícitos y recuperables
 * 
 * Detecta automáticamente el retorno del flujo OAuth y actualiza el estado
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

      // Agregar timeout de 10 segundos
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 10000)

      let res: Response
      try {
        res = await fetch(
          `${process.env.NEXT_PUBLIC_CONTROLFILE_URL}/api/github/status`,
          {
            headers: {
              Authorization: `Bearer ${token}`,
            },
            signal: controller.signal,
          }
        )
        clearTimeout(timeoutId)
      } catch (fetchError) {
        clearTimeout(timeoutId)
        if (fetchError instanceof Error && fetchError.name === "AbortError") {
          throw new Error("Timeout: La verificación de GitHub tardó más de 10 segundos")
        }
        throw fetchError
      }

      console.log("[GitHub] Respuesta del backend:", {
        status: res.status,
        ok: res.ok,
      })

      if (!res.ok) {
        // Intentar parsear error, pero manejar respuestas no-JSON
        let errorData: any = {}
        try {
          const text = await res.text()
          if (text) {
            errorData = JSON.parse(text)
          }
        } catch {
          // Respuesta no es JSON, usar statusText
        }
        
        const errorMessage = errorData.error || `Error ${res.status}: ${res.statusText || "Error desconocido"}`
        
        console.error("[GitHub] Error al verificar estado:", {
          status: res.status,
          statusText: res.statusText,
          error: errorMessage,
          timestamp: new Date().toISOString(),
        })

        setState("error")
        setError(errorMessage)
        setIsChecking(false)
        return
      }

      // Parsear respuesta JSON con protección
      let data: any = {}
      try {
        const text = await res.text()
        if (text) {
          data = JSON.parse(text)
        }
      } catch (parseError) {
        console.error("[GitHub] Error al parsear respuesta JSON:", {
          error: parseError,
          responseText: await res.text().catch(() => ""),
        })
        throw new Error("Respuesta inválida del servidor")
      }
      
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

      // Agregar timeout de 10 segundos
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 10000)

      let res: Response
      try {
        res = await fetch(
          `${process.env.NEXT_PUBLIC_CONTROLFILE_URL}/api/auth/github/init`,
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${token}`,
            },
            signal: controller.signal,
          }
        )
        clearTimeout(timeoutId)
      } catch (fetchError) {
        clearTimeout(timeoutId)
        if (fetchError instanceof Error && fetchError.name === "AbortError") {
          throw new Error("Timeout: La inicialización de OAuth tardó más de 10 segundos")
        }
        throw fetchError
      }

      console.log("[GitHub] Respuesta del backend al inicializar OAuth:", {
        status: res.status,
        ok: res.ok,
      })

      if (!res.ok) {
        // Intentar parsear error, pero manejar respuestas no-JSON
        let errorData: any = {}
        try {
          const text = await res.text()
          if (text) {
            errorData = JSON.parse(text)
          }
        } catch {
          // Respuesta no es JSON, usar statusText
        }
        
        const errorMessage = errorData.error || `Error ${res.status}: ${res.statusText || "Error desconocido"}`
        
        console.error("[GitHub] Error al inicializar OAuth:", {
          status: res.status,
          statusText: res.statusText,
          error: errorMessage,
          timestamp: new Date().toISOString(),
        })

        setState("error")
        setError(errorMessage)
        return
      }

      // Parsear respuesta JSON con protección
      let data: any = {}
      try {
        const text = await res.text()
        if (text) {
          data = JSON.parse(text)
        }
      } catch (parseError) {
        console.error("[GitHub] Error al parsear respuesta JSON:", {
          error: parseError,
          responseText: await res.text().catch(() => ""),
        })
        throw new Error("Respuesta inválida del servidor")
      }

      const githubAuthUrl = data.githubAuthUrl

      if (!githubAuthUrl || typeof githubAuthUrl !== "string") {
        throw new Error("La respuesta del servidor no contiene githubAuthUrl válido")
      }

      console.log("[GitHub] Redirigiendo a GitHub OAuth...")
      
      // Redirigir a la URL de autorización de GitHub
      window.location.href = githubAuthUrl
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Error desconocido al conectar con GitHub"
      
      console.error("[GitHub] Error al conectar:", {
        error: errorMessage,
        exception: err,
      })

      setState("error")
      setError(errorMessage)
    }
  }, [])

  /**
   * Desconecta la cuenta de GitHub
   * Limpia el estado local y fuerza githubState = not_connected
   */
  const disconnect = useCallback(async () => {
    try {
      setError(null)
      setIsChecking(true)
      setState("connecting")

      const auth = getAuth()
      const user = auth.currentUser

      if (!user) {
        const errorMessage = "Usuario no autenticado"
        console.error("[GitHub] Error al desconectar:", errorMessage)
        setState("error")
        setError(errorMessage)
        setIsChecking(false)
        return
      }

      const token = await user.getIdToken()

      console.log("[GitHub] Desconectando GitHub...")

      // Agregar timeout de 10 segundos
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 10000)

      let res: Response
      try {
        res = await fetch(
          `${process.env.NEXT_PUBLIC_CONTROLFILE_URL}/api/github/disconnect`,
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${token}`,
            },
            signal: controller.signal,
          }
        )
        clearTimeout(timeoutId)
      } catch (fetchError) {
        clearTimeout(timeoutId)
        if (fetchError instanceof Error && fetchError.name === "AbortError") {
          throw new Error("Timeout: La desconexión de GitHub tardó más de 10 segundos")
        }
        throw fetchError
      }

      console.log("[GitHub] Respuesta del backend al desconectar:", {
        status: res.status,
        ok: res.ok,
      })

      if (!res.ok) {
        // Intentar parsear error, pero manejar respuestas no-JSON
        let errorData: any = {}
        try {
          const text = await res.text()
          if (text) {
            errorData = JSON.parse(text)
          }
        } catch {
          // Respuesta no es JSON, usar statusText
        }
        
        const errorMessage = errorData.error || `Error ${res.status}: ${res.statusText || "Error desconocido"}`
        
        console.error("[GitHub] Error al desconectar:", {
          status: res.status,
          statusText: res.statusText,
          error: errorMessage,
          timestamp: new Date().toISOString(),
        })

        setState("error")
        setError(errorMessage)
        setIsChecking(false)
        return
      }

      // Desconexión exitosa: limpiar estado local y forzar not_connected
      console.log("[GitHub] Desconexión exitosa, limpiando estado local...")
      setState("not_connected")
      setError(null)
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Error desconocido al desconectar GitHub"
      
      console.error("[GitHub] Excepción al desconectar:", {
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
   * Efecto unificado: detecta parámetros OAuth y verifica estado inicial
   * Evita doble fetch al unificar la lógica en un solo useEffect
   */
  useEffect(() => {
    if (typeof window === "undefined") {
      checkStatus()
      return
    }

    const urlParams = new URLSearchParams(window.location.search)
    const success = urlParams.get("success")
    const errorParam = urlParams.get("error")
    const reason = urlParams.get("reason")

    // Si hay parámetros OAuth, procesarlos primero
    if (success === "true" || success === "1") {
      console.log("[GitHub] OAuth completado exitosamente, verificando estado...")
      // Limpiar parámetros de URL después de procesarlos
      const cleanUrl = window.location.pathname
      window.history.replaceState({}, "", cleanUrl)
      // Verificar estado después de un breve delay para asegurar que el backend procesó
      setTimeout(() => {
        checkStatus()
      }, 500)
    } else if (errorParam) {
      const errorMessage = reason || errorParam || "Error al conectar con GitHub"
      console.error("[GitHub] OAuth falló:", {
        error: errorParam,
        reason: reason,
        timestamp: new Date().toISOString(),
      })
      setState("error")
      setError(errorMessage)
      // Limpiar parámetros de URL
      const cleanUrl = window.location.pathname
      window.history.replaceState({}, "", cleanUrl)
    } else {
      // Si no hay parámetros OAuth, verificar estado normalmente
      checkStatus()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []) // Solo ejecutar al montar

  return {
    state,
    error,
    checkStatus,
    connect,
    disconnect,
    isChecking,
  }
}

"use client"

import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from "react"
import { toast } from "sonner"
import type {
  IndexRepositoryRequest,
  IndexRepositoryResponse,
  RepositoryStatusResponse,
} from "./types/api-contract"

// Re-exportar para uso en componentes
export type { RepositoryStatusResponse }

/**
 * Contexto de repositorio - Arquitectura pasiva
 * El frontend confía plenamente en el backend como única fuente de verdad
 */
interface RepositoryContextType {
  // Estado (solo lo que viene del backend)
  repositoryId: string | null
  status: RepositoryStatusResponse["status"]
  loading: boolean
  error: string | null
  preferencesLoaded: boolean
  
  // Metadata del status (solo para display)
  statusData: {
    indexedAt?: string
    stats?: RepositoryStatusResponse["stats"]
  } | null

  // Acciones
  indexRepository: (repositoryId: string, force?: boolean) => Promise<void>
  refreshStatus: (repositoryId: string) => Promise<void>
}

const RepositoryContext = createContext<RepositoryContextType | undefined>(undefined)

const POLLING_INTERVAL = 4000 // 4 segundos

export function RepositoryProvider({ children }: { children: React.ReactNode }) {
  const [repositoryId, setRepositoryId] = useState<string | null>(null)
  const [status, setStatus] = useState<RepositoryStatusResponse["status"]>("idle")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [statusData, setStatusData] = useState<RepositoryContextType["statusData"]>(null)
  const [preferencesLoaded, setPreferencesLoaded] = useState(false)

  // Ref para almacenar información del polling
  const pollingRef = useRef<{
    intervalId: ReturnType<typeof setInterval> | null
    repositoryId: string | null
    prevStatus: RepositoryStatusResponse["status"] | null
  }>({
    intervalId: null,
    repositoryId: null,
    prevStatus: null,
  })

  // Limpiar polling al desmontar
  useEffect(() => {
    return () => {
      if (pollingRef.current.intervalId) {
        clearInterval(pollingRef.current.intervalId)
      }
    }
  }, [])

  /**
   * Actualiza las preferencias del usuario con el repositorio activo
   */
  const updateUserPreferences = useCallback(
    async (activeRepositoryId: string | null) => {
      if (typeof window === "undefined") return

      try {
        if (activeRepositoryId) {
          localStorage.setItem("controlrepo.activeRepositoryId", activeRepositoryId)
        } else {
          localStorage.removeItem("controlrepo.activeRepositoryId")
        }
      } catch (err) {
        console.error("Error al actualizar preferencias de usuario:", err)
      }
    },
    []
  )

  // Resetear preferencesLoaded al montar
  useEffect(() => {
    setPreferencesLoaded(false)
  }, [])

  /**
   * Detiene el polling activo
   */
  const stopPolling = useCallback(() => {
    if (pollingRef.current.intervalId) {
      clearInterval(pollingRef.current.intervalId)
      pollingRef.current.intervalId = null
    }
    pollingRef.current.repositoryId = null
    pollingRef.current.prevStatus = null
  }, [])

  /**
   * Inicia polling automático para verificar el estado
   * Solo consulta el backend, no infiere estados
   */
  const startPolling = useCallback(
    (repoId: string) => {
      if (!repoId || typeof repoId !== "string" || !repoId.startsWith("github:")) {
        console.warn(`[startPolling] repositoryId inválido: "${repoId}"`)
        return
      }

      stopPolling()
      pollingRef.current.repositoryId = repoId
      // Inicializar prevStatus con el estado actual antes de empezar polling
      pollingRef.current.prevStatus = status

      const poll = async () => {
        try {
          // Agregar timeout de 10 segundos para polling
          const controller = new AbortController()
          const timeoutId = setTimeout(() => controller.abort(), 10000)

          let response: Response
          try {
            response = await fetch(`/api/repository/status?repositoryId=${encodeURIComponent(repoId)}`, {
              signal: controller.signal,
            })
            clearTimeout(timeoutId)
          } catch (fetchError) {
            clearTimeout(timeoutId)
            if (fetchError instanceof Error && fetchError.name === "AbortError") {
              console.warn(`[startPolling] Timeout al obtener estado para ${repoId}`)
              return // No detener polling por timeouts temporales
            }
            throw fetchError
          }

          // Según el contrato: siempre devuelve 200
          if (!response.ok) {
            console.error(`[startPolling] Error al obtener estado: ${response.status} ${response.statusText}`)
            return
          }

          // Parsear respuesta JSON con protección
          let data: RepositoryStatusResponse
          try {
            const text = await response.text()
            if (!text) {
              console.warn(`[startPolling] Respuesta vacía para ${repoId}`)
              return
            }
            data = JSON.parse(text) as RepositoryStatusResponse
          } catch (parseError) {
            console.error(`[startPolling] Error al parsear respuesta JSON para ${repoId}:`, {
              error: parseError,
            })
            return // No detener polling por errores de parseo temporales
          }

          // Logging claro del status recibido
          console.log(`[startPolling] Status recibido para ${repoId}:`, {
            status: data.status,
            repositoryId: data.repositoryId,
            error: data.error,
            hasStats: !!data.stats,
            timestamp: new Date().toISOString(),
          })

          // Guardar estado previo antes de actualizar (para detectar transiciones)
          const prevStatus = pollingRef.current.prevStatus

          // Actualizar estado exactamente como viene del backend (sin normalizar)
          setRepositoryId(data.repositoryId)
          setStatus(data.status)
          setStatusData({
            indexedAt: data.indexedAt,
            stats: data.stats,
          })

          // Actualizar ref con el nuevo status para la próxima iteración
          pollingRef.current.prevStatus = data.status

          // Si hay error, mostrarlo claramente
          if (data.error) {
            setError(data.error)
            console.error(`[startPolling] Error del backend para ${repoId}:`, {
              error: data.error,
              status: data.status,
              timestamp: new Date().toISOString(),
            })
          } else {
            setError(null)
          }

          // Detener polling cuando está completed o error
          if (data.status === "completed" || data.status === "error") {
            console.log(`[startPolling] Deteniendo polling para ${repoId}, status=${data.status}`)
            stopPolling()
            
            if (data.status === "completed") {
              // Verificar si acabamos de completar (transición de indexing a completed)
              // Usar prevStatus del ref en lugar del closure para detectar correctamente la transición
              const wasIndexing = prevStatus === "indexing"
              if (wasIndexing) {
                const fileCount = data.stats?.totalFiles || 0
                toast.success("Repositorio indexado correctamente", {
                  description: `El repositorio ha sido indexado exitosamente. ${fileCount} archivos procesados.`,
                  duration: 5000,
                })
              }
              
              // Actualizar preferencias cuando se completa
              await updateUserPreferences(data.repositoryId)
            } else if (data.status === "error") {
              // Mostrar error real cuando status === "error"
              if (data.error) {
                toast.error("Error al indexar repositorio", {
                  description: data.error,
                  duration: 10000,
                })
              }
            }
          }
          // Si está indexing o idle, continuar polling
        } catch (err) {
          const errorMessage = err instanceof Error ? err.message : "Error desconocido"
          console.error(`[startPolling] Error en polling para ${repoId}:`, {
            error: errorMessage,
            exception: err,
            timestamp: new Date().toISOString(),
          })
          // No detener polling por errores de red temporales
        }
      }

      // Ejecutar inmediatamente
      poll()

      // Configurar intervalo
      pollingRef.current.intervalId = setInterval(() => {
        poll()
      }, POLLING_INTERVAL)
    },
    [stopPolling, updateUserPreferences, status]
  )

  /**
   * Indexa un repositorio
   * POST /repositories/index según contrato
   */
  const indexRepository = useCallback(
    async (repoId: string, force: boolean = false) => {
      if (!repoId || typeof repoId !== "string" || !repoId.startsWith("github:")) {
        const errorMessage = `repositoryId inválido: "${repoId}"`
        console.warn(`[indexRepository] ${errorMessage}`)
        setError(errorMessage)
        setStatus("error")
        return
      }

      setLoading(true)
      setError(null)
      setRepositoryId(repoId)
      setStatus("idle")
      setStatusData(null)

      try {
        // El backend maneja el acceso público y el fallback con token de entorno
        const requestBody: IndexRepositoryRequest = {
          repositoryId: repoId,
          force,
        }

        // Log del payload antes del fetch
        console.log("Index request payload:", { repositoryId: repoId })

        // Agregar timeout de 30 segundos para indexación
        const controller = new AbortController()
        const timeoutId = setTimeout(() => controller.abort(), 30000)

        let response: Response
        try {
          response = await fetch("/api/repositories/index", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify(requestBody),
            signal: controller.signal,
          })
          clearTimeout(timeoutId)
        } catch (fetchError) {
          clearTimeout(timeoutId)
          if (fetchError instanceof Error && fetchError.name === "AbortError") {
            throw new Error("Timeout: La solicitud de indexación tardó más de 30 segundos")
          }
          throw fetchError
        }

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}))
          const errorMessage = errorData.error || `Error al indexar: ${response.statusText}`
          
          console.error(`[indexRepository] Error del backend para ${repoId}:`, {
            status: response.status,
            statusText: response.statusText,
            error: errorMessage,
            errorData,
          })
          
          throw new Error(errorMessage)
        }

        const data = (await response.json()) as IndexRepositoryResponse

        // Logging claro del status recibido
        console.log(`[indexRepository] Status recibido para ${repoId}:`, {
          status: data.status,
          repositoryId: data.repositoryId,
          message: data.message,
          timestamp: new Date().toISOString(),
        })

        // Actualizar estado según respuesta del backend
        setRepositoryId(data.repositoryId)
        setStatus(data.status)

        // Si está indexing, iniciar polling
        if (data.status === "indexing") {
          startPolling(data.repositoryId)
        } else if (data.status === "completed") {
          // Si ya está completed, refrescar status para obtener stats
          await refreshStatus(data.repositoryId)
          await updateUserPreferences(data.repositoryId)
        }
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : "Error desconocido al indexar"
        
        console.error(`[indexRepository] Excepción al indexar ${repoId}:`, {
          error: errorMessage,
          exception: err,
          timestamp: new Date().toISOString(),
        })
        
        setError(errorMessage)
        setStatus("error")
        // NO resetear repositoryId en error - mantenerlo para permitir reintento
        setStatusData(null)
        stopPolling()
      } finally {
        // SIEMPRE resetear loading, incluso si hay error
        setLoading(false)
        console.log(`[indexRepository] Finalizado para ${repoId}, loading=false`)
      }
    },
    [startPolling, stopPolling, updateUserPreferences]
  )

  /**
   * Refresca el estado del repositorio
   * GET /repositories/{repositoryId}/status según contrato
   */
  const refreshStatus = useCallback(
    async (repoId: string) => {
      if (!repoId || typeof repoId !== "string" || !repoId.startsWith("github:")) {
        console.warn(`[refreshStatus] repositoryId inválido: "${repoId}"`)
        setLoading(false)
        return
      }

      setLoading(true)
      setError(null)

      try {
        // Agregar timeout de 10 segundos
        const controller = new AbortController()
        const timeoutId = setTimeout(() => controller.abort(), 10000)

        let response: Response
        try {
          response = await fetch(`/api/repository/status?repositoryId=${encodeURIComponent(repoId)}`, {
            signal: controller.signal,
          })
          clearTimeout(timeoutId)
        } catch (fetchError) {
          clearTimeout(timeoutId)
          if (fetchError instanceof Error && fetchError.name === "AbortError") {
            throw new Error("Timeout: La verificación de estado tardó más de 10 segundos")
          }
          throw fetchError
        }

        if (!response.ok) {
          // Intentar parsear error
          let errorData: any = {}
          try {
            const text = await response.text()
            if (text) {
              errorData = JSON.parse(text)
            }
          } catch {
            // Respuesta no es JSON
          }
          
          const errorMessage = errorData.error || `Error ${response.status}: ${response.statusText || "Error desconocido"}`
          throw new Error(errorMessage)
        }

        // Parsear respuesta JSON con protección
        let data: RepositoryStatusResponse
        try {
          const text = await response.text()
          if (!text) {
            throw new Error("Respuesta vacía del servidor")
          }
          data = JSON.parse(text) as RepositoryStatusResponse
        } catch (parseError) {
          console.error("[refreshStatus] Error al parsear respuesta JSON:", {
            error: parseError,
            status: response.status,
          })
          throw new Error("Respuesta inválida del servidor")
        }

        // Logging claro del status recibido
        console.log(`[refreshStatus] Status recibido para ${repoId}:`, {
          status: data.status,
          repositoryId: data.repositoryId,
          error: data.error,
          hasStats: !!data.stats,
          timestamp: new Date().toISOString(),
        })

        // Actualizar estado exactamente como viene del backend (sin normalizar)
        setRepositoryId(data.repositoryId)
        setStatus(data.status)
        setStatusData({
          indexedAt: data.indexedAt,
          stats: data.stats,
        })

        // Si hay error, mostrarlo claramente
        if (data.error) {
          setError(data.error)
          console.error(`[refreshStatus] Error del backend para ${repoId}:`, {
            error: data.error,
            status: data.status,
            timestamp: new Date().toISOString(),
          })
        } else {
          setError(null)
        }

        // Si está indexing, iniciar polling (solo si no hay uno activo)
        if (data.status === "indexing") {
          if (!pollingRef.current.intervalId) {
            startPolling(data.repositoryId)
          }
        } else if (data.status === "completed") {
          await updateUserPreferences(data.repositoryId)
        } else if (data.status === "idle") {
          await updateUserPreferences(null)
        } else if (data.status === "error") {
          // Mostrar error real cuando status === "error"
          if (data.error) {
            toast.error("Error en el repositorio", {
              description: data.error,
              duration: 10000,
            })
          }
        }
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : "Error desconocido al refrescar"
        
        console.error(`[refreshStatus] Excepción al refrescar ${repoId}:`, {
          error: errorMessage,
          exception: err,
          timestamp: new Date().toISOString(),
        })
        
        setError(errorMessage)
        setStatus("error")
        // NO resetear repositoryId en error - mantenerlo para permitir reintento
        setStatusData(null)
      } finally {
        // SIEMPRE resetear loading, incluso si hay error
        setLoading(false)
        console.log(`[refreshStatus] Finalizado para ${repoId}, loading=false`)
      }
    },
    [startPolling, updateUserPreferences]
  )

  /**
   * Restaura el repositorio activo desde las preferencias del usuario
   */
  useEffect(() => {
    if (preferencesLoaded) return

    const restoreActiveRepository = async () => {
      try {
        if (typeof window !== "undefined") {
          const repoId = localStorage.getItem("controlrepo.activeRepositoryId")
          if (repoId && repoId.startsWith("github:")) {
            await refreshStatus(repoId)
          }
        }
      } catch (err) {
        console.error("Error al restaurar repositorio activo:", err)
      } finally {
        setPreferencesLoaded(true)
      }
    }

    restoreActiveRepository()
  }, [preferencesLoaded, refreshStatus])

  const value: RepositoryContextType = {
    repositoryId,
    status,
    loading,
    error,
    preferencesLoaded,
    statusData,
    indexRepository,
    refreshStatus,
  }

  return <RepositoryContext.Provider value={value}>{children}</RepositoryContext.Provider>
}

/**
 * Hook para usar el contexto de repositorio
 * @throws Error si se usa fuera de RepositoryProvider
 */
export function useRepository() {
  const context = useContext(RepositoryContext)
  if (context === undefined) {
    throw new Error("useRepository must be used within a RepositoryProvider")
  }
  return context
}

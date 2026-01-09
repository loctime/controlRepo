"use client"

import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from "react"
import { useAuth } from "./auth-context"
import { getAuth } from "firebase/auth"
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

/**
 * Parsea repositoryId en formato: github:owner:repo
 */
function parseRepositoryId(repositoryId: string): { owner: string; repo: string } | null {
  if (!repositoryId || typeof repositoryId !== "string") {
    return null
  }
  
  const trimmed = repositoryId.trim()
  if (!trimmed || !trimmed.startsWith("github:")) {
    return null
  }
  
  const parts = trimmed.replace("github:", "").split(":")
  if (parts.length !== 2) {
    return null
  }
  
  const owner = parts[0].trim()
  const repo = parts[1].trim()
  if (!owner || !repo) {
    return null
  }
  
  return { owner, repo }
}

export function RepositoryProvider({ children }: { children: React.ReactNode }) {
  const [repositoryId, setRepositoryId] = useState<string | null>(null)
  const [status, setStatus] = useState<RepositoryStatusResponse["status"]>("idle")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [statusData, setStatusData] = useState<RepositoryContextType["statusData"]>(null)
  const { user } = useAuth()
  const [preferencesLoaded, setPreferencesLoaded] = useState(false)

  // Ref para almacenar información del polling
  const pollingRef = useRef<{
    intervalId: ReturnType<typeof setInterval> | null
    repositoryId: string | null
  }>({
    intervalId: null,
    repositoryId: null,
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
      if (!user?.uid) return

      try {
        const auth = getAuth()
        const currentUser = auth.currentUser
        if (!currentUser) {
          return
        }

        const token = await currentUser.getIdToken()

        await fetch("/api/user/preferences", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${token}`,
          },
          body: JSON.stringify({
            activeRepositoryId,
          }),
        })
      } catch (err) {
        console.error("Error al actualizar preferencias de usuario:", err)
      }
    },
    [user?.uid]
  )

  // Resetear preferencesLoaded cuando el usuario cambia
  useEffect(() => {
    setPreferencesLoaded(false)
  }, [user?.uid])

  /**
   * Detiene el polling activo
   */
  const stopPolling = useCallback(() => {
    if (pollingRef.current.intervalId) {
      clearInterval(pollingRef.current.intervalId)
      pollingRef.current.intervalId = null
    }
    pollingRef.current.repositoryId = null
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

      const poll = async () => {
        try {
          const response = await fetch(`/api/repository/status?repositoryId=${encodeURIComponent(repoId)}`)

          // Según el contrato: siempre devuelve 200
          if (!response.ok) {
            console.error(`[startPolling] Error al obtener estado: ${response.statusText}`)
            return
          }

          const data = (await response.json()) as RepositoryStatusResponse

          // Actualizar estado exactamente como viene del backend
          setRepositoryId(data.repositoryId)
          setStatus(data.status)
          setStatusData({
            indexedAt: data.indexedAt,
            stats: data.stats,
          })

          // Si hay error, mostrarlo
          if (data.error) {
            setError(data.error)
          } else {
            setError(null)
          }

          // Detener polling cuando está ready o error
          if (data.status === "ready" || data.status === "error") {
            stopPolling()
            
            if (data.status === "ready") {
              // Verificar si acabamos de completar (transición de indexing a ready)
              const wasIndexing = status === "indexing"
              if (wasIndexing) {
                const fileCount = data.stats?.totalFiles || 0
                toast.success("Repositorio indexado correctamente", {
                  description: `El repositorio ha sido indexado exitosamente. ${fileCount} archivos procesados.`,
                  duration: 5000,
                })
              }
              
              // Actualizar preferencias cuando se completa
              await updateUserPreferences(data.repositoryId)
            }
          }
          // Si está indexing o idle, continuar polling
        } catch (err) {
          console.error("Error en polling:", err)
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
        const auth = getAuth()
        const currentUser = auth.currentUser

        if (!currentUser) {
          throw new Error("No hay usuario autenticado. Por favor, inicia sesión.")
        }

        const token = await currentUser.getIdToken()

        // Obtener accessToken de GitHub si está disponible
        // Por ahora, el backend lo obtiene automáticamente desde Firestore
        const requestBody: IndexRepositoryRequest = {
          repositoryId: repoId,
          force,
        }

        // Log del payload antes del fetch
        console.log("Index request payload:", { repositoryId: repoId })

        const response = await fetch("/api/repositories/index", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${token}`,
          },
          body: JSON.stringify(requestBody),
        })

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}))
          throw new Error(errorData.error || `Error al indexar: ${response.statusText}`)
        }

        const data = (await response.json()) as IndexRepositoryResponse

        // Actualizar estado según respuesta del backend
        setRepositoryId(data.repositoryId)
        setStatus(data.status)

        // Si está indexing, iniciar polling
        if (data.status === "indexing") {
          startPolling(data.repositoryId)
        } else if (data.status === "ready") {
          // Si ya está ready, refrescar status para obtener stats
          await refreshStatus(data.repositoryId)
          await updateUserPreferences(data.repositoryId)
        }
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : "Error desconocido al indexar"
        setError(errorMessage)
        setStatus("error")
        setRepositoryId(null)
        setStatusData(null)
        stopPolling()
      } finally {
        setLoading(false)
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
        // Según el contrato: siempre devuelve 200
        const response = await fetch(`/api/repository/status?repositoryId=${encodeURIComponent(repoId)}`)

        if (!response.ok) {
          throw new Error(`Error al obtener estado: ${response.statusText}`)
        }

        const data = (await response.json()) as RepositoryStatusResponse

        // Actualizar estado exactamente como viene del backend
        setRepositoryId(data.repositoryId)
        setStatus(data.status)
        setStatusData({
          indexedAt: data.indexedAt,
          stats: data.stats,
        })

        if (data.error) {
          setError(data.error)
        } else {
          setError(null)
        }

        // Si está indexing, iniciar polling (solo si no hay uno activo)
        if (data.status === "indexing") {
          if (!pollingRef.current.intervalId) {
            startPolling(data.repositoryId)
          }
        } else if (data.status === "ready") {
          await updateUserPreferences(data.repositoryId)
        } else if (data.status === "idle") {
          await updateUserPreferences(null)
        }
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : "Error desconocido al refrescar"
        setError(errorMessage)
        setStatus("error")
        setRepositoryId(null)
        setStatusData(null)
      } finally {
        setLoading(false)
      }
    },
    [startPolling, updateUserPreferences]
  )

  /**
   * Restaura el repositorio activo desde las preferencias del usuario
   */
  useEffect(() => {
    if (!user?.uid || preferencesLoaded) return

    const restoreActiveRepository = async () => {
      try {
        const auth = getAuth()
        const currentUser = auth.currentUser
        if (!currentUser) {
          setPreferencesLoaded(true)
          return
        }

        const token = await currentUser.getIdToken()

        const response = await fetch("/api/user/preferences", {
          headers: {
            "Authorization": `Bearer ${token}`,
          },
        })
        
        if (!response.ok) {
          setPreferencesLoaded(true)
          return
        }

        const preferences = await response.json()
        if (preferences.activeRepositoryId) {
          const repoId = preferences.activeRepositoryId
          // Validar formato
          if (repoId && typeof repoId === "string" && repoId.startsWith("github:")) {
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
  }, [user?.uid, preferencesLoaded, refreshStatus])

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

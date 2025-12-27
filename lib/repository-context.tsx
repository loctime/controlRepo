"use client"

import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from "react"
import { RepositoryIndex, IndexedFile, FileCategory, FileType } from "./types/repository"
import { RepositoryMetrics } from "./types/repository-metrics"
import { parseRepositoryId } from "./repository/utils"
import { searchFiles as searchFilesUtil } from "./repository/search"
import { useAuth } from "./auth-context"
import { getAuth } from "firebase/auth"

type RepositoryStatus = "idle" | "indexing" | "completed" | "error"

interface RepositoryContextType {
  // Estado
  currentIndex: RepositoryIndex | null
  currentMetrics: RepositoryMetrics | null
  status: RepositoryStatus
  loading: boolean
  error: string | null
  repositoryId: string | null

  // Acciones
  indexRepository: (owner: string, repo: string, branch?: string) => Promise<void>
  reindexRepository: (owner: string, repo: string, branch?: string) => Promise<void>
  refreshStatus: (owner: string, repo: string, branch?: string) => Promise<void>

  // Helpers de solo lectura (trabajan con currentIndex)
  getFilesByCategory: (category: FileCategory) => IndexedFile[]
  getFilesByType: (type: FileType) => IndexedFile[]
  getFileByPath: (path: string) => IndexedFile | null
  getRelatedFiles: (path: string) => IndexedFile[]
  searchFiles: (query: string) => IndexedFile[]
}

const RepositoryContext = createContext<RepositoryContextType | undefined>(undefined)

const POLLING_INTERVAL = 4000 // 4 segundos (entre 3-5 segundos)

export function RepositoryProvider({ children }: { children: React.ReactNode }) {
  const [currentIndex, setCurrentIndex] = useState<RepositoryIndex | null>(null)
  const [currentMetrics, setCurrentMetrics] = useState<RepositoryMetrics | null>(null)
  const [status, setStatus] = useState<RepositoryStatus>("idle")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [repositoryId, setRepositoryId] = useState<string | null>(null)
  const { user } = useAuth()
  const [preferencesLoaded, setPreferencesLoaded] = useState(false)

  // Ref para almacenar información del polling
  const pollingRef = useRef<{
    intervalId: ReturnType<typeof setInterval> | null
    owner: string | null
    repo: string | null
    branch: string | null
  }>({
    intervalId: null,
    owner: null,
    repo: null,
    branch: null,
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
   * Carga las métricas del repositorio desde el API
   */
  const loadMetrics = useCallback(
    async (owner: string, repo: string, branch: string = "main") => {
      try {
        const response = await fetch(
          `/api/repository/metrics?owner=${encodeURIComponent(owner)}&repo=${encodeURIComponent(repo)}&branch=${encodeURIComponent(branch)}`
        )

        if (!response.ok) {
          // Si no hay métricas (404), establecer a null y continuar sin error
          if (response.status === 404) {
            setCurrentMetrics(null)
            return
          }
          throw new Error(`Error al obtener métricas: ${response.statusText}`)
        }

        const metrics = await response.json()
        setCurrentMetrics(metrics as RepositoryMetrics)
      } catch (err) {
        console.error("Error al cargar métricas:", err)
        // No establecer error global, solo loguear
        // Las métricas son opcionales y no deberían bloquear el flujo
        setCurrentMetrics(null)
      }
    },
    []
  )

  /**
   * Actualiza las preferencias del usuario con el repositorio activo
   */
  const updateUserPreferences = useCallback(
    async (activeRepositoryId: string | null) => {
      if (!user?.uid) return

      try {
        await fetch("/api/user/preferences", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            userId: user.uid,
            activeRepositoryId,
          }),
        })
      } catch (err) {
        console.error("Error al actualizar preferencias de usuario:", err)
        // No bloquear el flujo si falla la actualización de preferencias
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
    pollingRef.current.owner = null
    pollingRef.current.repo = null
    pollingRef.current.branch = null
  }, [])

  /**
   * Inicia polling automático para verificar el estado de indexación
   */
  const startPolling = useCallback(
    (owner: string, repo: string, branch: string) => {
      // Detener polling anterior si existe
      stopPolling()

      pollingRef.current.owner = owner
      pollingRef.current.repo = repo
      pollingRef.current.branch = branch

      const poll = async () => {
        try {
          const response = await fetch(
            `/api/repository/status?owner=${encodeURIComponent(owner)}&repo=${encodeURIComponent(repo)}&branch=${encodeURIComponent(branch)}`
          )

          if (!response.ok) {
            throw new Error(`Error al obtener estado: ${response.statusText}`)
          }

          const data = await response.json()

          // Verificar si es un RepositoryIndex completo (tiene la propiedad 'files')
          // o una respuesta parcial (solo tiene 'repositoryId' y 'status')
          if ("files" in data) {
            // Es un RepositoryIndex completo
            const index = data as RepositoryIndex
            setCurrentIndex(index)
            setRepositoryId(index.id)

            // Si el estado del índice cambió a "completed" o "error", detener polling
            if (index.status === "completed") {
              setStatus("completed")
              // Actualizar preferencias cuando se completa la indexación
              updateUserPreferences(index.id).catch((err) => {
                console.error("Error al actualizar preferencias:", err)
              })
              // Cargar métricas cuando el índice está completado
              const parsed = parseRepositoryId(index.id)
              if (parsed) {
                loadMetrics(parsed.owner, parsed.repo, parsed.branch).catch((err) => {
                  console.error("Error al cargar métricas:", err)
                })
              }
              stopPolling()
            } else if (index.status === "error") {
              setStatus("error")
              setError("Error durante la indexación")
              stopPolling()
            } else {
              // Aún está indexando
              setStatus("indexing")
            }
          } else {
            // Es una respuesta parcial (indexing o not_found)
            const partialResponse = data as { repositoryId: string; status: string }
            setRepositoryId(partialResponse.repositoryId)

            if (partialResponse.status === "indexing") {
              // Está indexando pero el índice aún no existe
              setCurrentIndex(null)
              setCurrentMetrics(null)
              setStatus("indexing")
            } else if (partialResponse.status === "not_found") {
              // No existe índice y tampoco está indexando
              setCurrentIndex(null)
              setCurrentMetrics(null)
              setStatus("idle")
              stopPolling()
            }
          }
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
      [stopPolling, updateUserPreferences, loadMetrics]
    )

  /**
   * Indexa un repositorio completo
   */
  const indexRepository = useCallback(
    async (owner: string, repo: string, branch: string = "main") => {
      setLoading(true)
      setError(null)
      setStatus("indexing")
      setRepositoryId(`${owner}/${repo}`)
      setCurrentIndex(null)
      setCurrentMetrics(null)

      try {
        // Obtener el usuario actual y su token de autenticación
        const auth = getAuth()
        const currentUser = auth.currentUser

        if (!currentUser) {
          throw new Error("No hay usuario autenticado. Por favor, inicia sesión.")
        }

        const token = await currentUser.getIdToken()

        const response = await fetch("/api/repository/index", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${token}`,
          },
          body: JSON.stringify({ owner, repo, branch }),
        })

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}))
          throw new Error(errorData.error || `Error al indexar: ${response.statusText}`)
        }

        const data = await response.json()

        // Actualizar preferencias del usuario
        await updateUserPreferences(`${owner}/${repo}`)

        // Iniciar polling automático
        startPolling(owner, repo, branch)
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : "Error desconocido al indexar"
        setError(errorMessage)
        setStatus("error")
        setRepositoryId(null)
        setCurrentIndex(null)
        setCurrentMetrics(null)
        stopPolling()
      } finally {
        setLoading(false)
      }
    },
    [startPolling, stopPolling, updateUserPreferences]
  )

  /**
   * Re-indexa un repositorio existente
   */
  const reindexRepository = useCallback(
    async (owner: string, repo: string, branch: string = "main") => {
      setLoading(true)
      setError(null)
      setStatus("indexing")
      setRepositoryId(`${owner}/${repo}`)
      setCurrentIndex(null)
      setCurrentMetrics(null)

      try {
        const response = await fetch("/api/repository/reindex", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ owner, repo, branch }),
        })

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}))
          throw new Error(errorData.error || `Error al re-indexar: ${response.statusText}`)
        }

        const data = await response.json()

        // Actualizar preferencias del usuario
        await updateUserPreferences(`${owner}/${repo}`)

        // Iniciar polling automático
        startPolling(owner, repo, branch)
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : "Error desconocido al re-indexar"
        setError(errorMessage)
        setStatus("error")
        setRepositoryId(null)
        setCurrentIndex(null)
        setCurrentMetrics(null)
        stopPolling()
      } finally {
        setLoading(false)
      }
    },
    [startPolling, stopPolling, updateUserPreferences]
  )

  /**
   * Refresca el estado del índice sin iniciar indexación
   */
  const refreshStatus = useCallback(
    async (owner: string, repo: string, branch: string = "main") => {
      setLoading(true)
      setError(null)

      try {
        const response = await fetch(
          `/api/repository/status?owner=${encodeURIComponent(owner)}&repo=${encodeURIComponent(repo)}&branch=${encodeURIComponent(branch)}`
        )

        if (!response.ok) {
          throw new Error(`Error al obtener estado: ${response.statusText}`)
        }

        const data = await response.json()

        // Verificar si es un RepositoryIndex completo (tiene la propiedad 'files')
        // o una respuesta parcial (solo tiene 'repositoryId' y 'status')
        if ("files" in data) {
          // Es un RepositoryIndex completo
          const index = data as RepositoryIndex
          setCurrentIndex(index)
          setRepositoryId(index.id)

          // Actualizar status según el estado del índice
          if (index.status === "indexing") {
            setStatus("indexing")
            // Si está indexando, iniciar polling (solo si no hay uno activo)
            if (!pollingRef.current.intervalId) {
              startPolling(owner, repo, branch)
            }
          } else if (index.status === "completed") {
            setStatus("completed")
            // Actualizar preferencias cuando se restaura un repositorio completado
            await updateUserPreferences(index.id)
            // Cargar métricas cuando el índice está completado
            await loadMetrics(owner, repo, branch)
          } else {
            setStatus("error")
            setError("Error en el índice")
          }
        } else {
          // Es una respuesta parcial (indexing o not_found)
          const partialResponse = data as { repositoryId: string; status: string }
          setRepositoryId(partialResponse.repositoryId)

          if (partialResponse.status === "indexing") {
            // Está indexando pero el índice aún no existe
            setCurrentIndex(null)
            setCurrentMetrics(null)
            setStatus("indexing")
            // Actualizar preferencias aunque esté indexando
            await updateUserPreferences(partialResponse.repositoryId)
            // Iniciar polling (solo si no hay uno activo)
            if (!pollingRef.current.intervalId) {
              startPolling(owner, repo, branch)
            }
          } else if (partialResponse.status === "not_found") {
            // No existe índice y tampoco está indexando
            setCurrentIndex(null)
            setCurrentMetrics(null)
            setStatus("idle")
            // Limpiar preferencias si el repositorio no existe
            await updateUserPreferences(null)
          }
        }
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : "Error desconocido al refrescar"
        setError(errorMessage)
        setStatus("error")
        setCurrentIndex(null)
        setCurrentMetrics(null)
      } finally {
        setLoading(false)
      }
    },
    [startPolling, updateUserPreferences, loadMetrics]
  )

  /**
   * Restaura el repositorio activo desde las preferencias del usuario
   */
  useEffect(() => {
    if (!user?.uid || preferencesLoaded) return

    const restoreActiveRepository = async () => {
      try {
        const response = await fetch(`/api/user/preferences?userId=${encodeURIComponent(user.uid)}`)
        if (!response.ok) {
          console.error("Error al obtener preferencias de usuario")
          setPreferencesLoaded(true)
          return
        }

        const preferences = await response.json()
        if (preferences.activeRepositoryId) {
          // Parsear repositoryId (formato: "owner/repo")
          const [owner, repo] = preferences.activeRepositoryId.split("/")
          if (owner && repo) {
            // Restaurar el repositorio usando refreshStatus
            // Esto cargará el índice completo si existe
            await refreshStatus(owner, repo)
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

  // Helpers de solo lectura (trabajan exclusivamente con currentIndex)

  /**
   * Obtiene archivos filtrados por categoría
   */
  const getFilesByCategory = useCallback(
    (category: FileCategory): IndexedFile[] => {
      if (!currentIndex || !currentIndex.files) return []
      return currentIndex.files.filter((file) => file.category === category)
    },
    [currentIndex]
  )

  /**
   * Obtiene archivos filtrados por tipo
   */
  const getFilesByType = useCallback(
    (type: FileType): IndexedFile[] => {
      if (!currentIndex || !currentIndex.files) return []
      return currentIndex.files.filter((file) => file.type === type)
    },
    [currentIndex]
  )

  /**
   * Obtiene un archivo por su path
   */
  const getFileByPath = useCallback(
    (path: string): IndexedFile | null => {
      if (!currentIndex || !currentIndex.files) return null
      return currentIndex.files.find((file) => file.path === path) || null
    },
    [currentIndex]
  )

  /**
   * Obtiene archivos relacionados a un archivo específico
   */
  const getRelatedFiles = useCallback(
    (path: string): IndexedFile[] => {
      if (!currentIndex || !currentIndex.files) return []

      const file = currentIndex.files.find((f) => f.path === path)
      if (!file) return []

      const relatedPaths = new Set<string>()
      
      // Agregar imports
      file.relations.imports.forEach((p) => relatedPaths.add(p))
      
      // Agregar archivos que importan este archivo
      file.relations.importedBy.forEach((p) => relatedPaths.add(p))
      
      // Agregar dependencias
      file.relations.dependsOn.forEach((p) => relatedPaths.add(p))
      
      // Agregar archivos relacionados
      file.relations.related.forEach((p) => relatedPaths.add(p))

      // Convertir paths a archivos
      return currentIndex.files.filter((f) => relatedPaths.has(f.path))
    },
    [currentIndex]
  )

  /**
   * Busca archivos por query (busca en nombre, path, tags y descripción)
   */
  const searchFilesCallback = useCallback(
    (query: string): IndexedFile[] => {
      if (!currentIndex || !currentIndex.files || !query.trim()) return []
      return searchFilesUtil(currentIndex.files, query)
    },
    [currentIndex]
  )

  const value: RepositoryContextType = {
    currentIndex,
    currentMetrics,
    status,
    loading,
    error,
    repositoryId,
    indexRepository,
    reindexRepository,
    refreshStatus,
    getFilesByCategory,
    getFilesByType,
    getFileByPath,
    getRelatedFiles,
    searchFiles: searchFilesCallback,
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


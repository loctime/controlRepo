"use client"

import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from "react"
import { RepositoryIndex, IndexedFile, FileCategory, FileType } from "./types/repository"
import { RepositoryMetrics } from "./types/repository-metrics"
import { searchFiles as searchFilesUtil } from "./repository/search"
import { useAuth } from "./auth-context"
import { getAuth } from "firebase/auth"
import { toast } from "sonner"

type RepositoryStatus = "idle" | "indexing" | "completed" | "error"

interface RepositoryContextType {
  // Estado
  currentIndex: RepositoryIndex | null
  currentMetrics: RepositoryMetrics | null
  status: RepositoryStatus
  loading: boolean
  error: string | null
  repositoryId: string | null
  preferencesLoaded: boolean

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

/**
 * Construye repositoryId en formato: github:owner:repo
 * Valida que owner y repo sean válidos antes de construir
 */
function buildRepositoryId(owner: string, repo: string): string | null {
  if (!owner || !repo || typeof owner !== "string" || typeof repo !== "string") {
    return null
  }
  const trimmedOwner = owner.trim()
  const trimmedRepo = repo.trim()
  if (!trimmedOwner || !trimmedRepo) {
    return null
  }
  return `github:${trimmedOwner}:${trimmedRepo}`
}

/**
 * Parsea repositoryId en formato: github:owner:repo o owner/repo (legacy)
 * Retorna null si el formato no es válido (sin lanzar errores)
 */
function parseRepositoryIdFromPrefs(repositoryId: string): { owner: string; repo: string } | null {
  if (!repositoryId || typeof repositoryId !== "string") {
    return null
  }
  
  const trimmed = repositoryId.trim()
  if (!trimmed) {
    return null
  }
  
  // Formato: github:owner:repo
  if (trimmed.startsWith("github:")) {
    const parts = trimmed.replace("github:", "").split(":")
    if (parts.length === 2) {
      const owner = parts[0].trim()
      const repo = parts[1].trim()
      // Validar que owner y repo no estén vacíos
      if (owner && repo) {
        return { owner, repo }
      }
    }
    return null
  }
  
  // Formato legacy: owner/repo
  const parts = trimmed.split("/")
  if (parts.length === 2) {
    const owner = parts[0].trim()
    const repo = parts[1].trim()
    // Validar que owner y repo no estén vacíos
    if (owner && repo) {
      return { owner, repo }
    }
  }
  
  return null
}

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
   * Solo acepta repositoryId válidos: github:owner:repo o null
   */
  const updateUserPreferences = useCallback(
    async (activeRepositoryId: string | null) => {
      if (!user?.uid) return

      // Validar que activeRepositoryId sea válido si no es null
      if (activeRepositoryId !== null) {
        const parsed = parseRepositoryIdFromPrefs(activeRepositoryId)
        if (!parsed) {
          console.warn(
            `[updateUserPreferences] Rechazado repositoryId inválido: "${activeRepositoryId}". No se actualizarán las preferencias.`
          )
          return
        }
      }

      try {
        // Obtener token de autenticación
        const auth = getAuth()
        const currentUser = auth.currentUser
        if (!currentUser) {
          console.error("No hay usuario autenticado para actualizar preferencias")
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
    pollingRef.current.repositoryId = null
  }, [])

  /**
   * Inicia polling automático para verificar el estado de indexación
   */
  const startPolling = useCallback(
    (owner: string, repo: string) => {
      // Validar owner y repo antes de continuar
      if (!owner || !repo || typeof owner !== "string" || typeof repo !== "string") {
        console.warn(`[startPolling] owner o repo inválidos: owner="${owner}", repo="${repo}"`)
        return
      }

      // Detener polling anterior si existe
      stopPolling()

      const repositoryId = buildRepositoryId(owner, repo)
      if (!repositoryId) {
        console.warn(`[startPolling] No se pudo construir repositoryId válido para owner="${owner}", repo="${repo}"`)
        return
      }
      pollingRef.current.repositoryId = repositoryId

      const poll = async () => {
        try {
          // Guard clause adicional: no hacer fetch si repositoryId es inválido
          if (!repositoryId || repositoryId === "undefined" || repositoryId.includes("undefined") || repositoryId.includes("null")) {
            console.warn(`[startPolling] repositoryId inválido en poll: "${repositoryId}"`)
            stopPolling()
            return
          }

          const response = await fetch(
            `/api/repository/status?repositoryId=${encodeURIComponent(repositoryId)}`
          )

          // Manejar 400/404 como estado final: asumir que no existe índice
          if (response.status === 400 || response.status === 404) {
            setCurrentIndex(null)
            setCurrentMetrics(null)
            setStatus("idle")
            stopPolling()
            return
          }

          if (!response.ok) {
            throw new Error(`Error al obtener estado: ${response.statusText}`)
          }

          const data = await response.json()

          // El endpoint /status solo devuelve metadata (status, repositoryId, stats, owner, repo, indexedAt)
          // NO devuelve files - currentIndex solo se setea cuando hay un índice completo real
          const statusResponse = data as { 
            repositoryId: string
            status: string
            owner?: string
            repo?: string
            stats?: { totalFiles?: number }
            indexedAt?: string
          }
          
          // Normalizar repositoryId al formato github:owner:repo
          let normalizedRepoId: string | null = null
          if (statusResponse.repositoryId.startsWith("github:")) {
            normalizedRepoId = statusResponse.repositoryId
          } else {
            normalizedRepoId = buildRepositoryId(owner, repo)
          }

          // Validar que normalizedRepoId sea válido
          if (!normalizedRepoId) {
            console.warn(`[startPolling] No se pudo normalizar repositoryId. statusResponse.repositoryId="${statusResponse.repositoryId}", owner="${owner}", repo="${repo}"`)
            stopPolling()
            return
          }

          setRepositoryId(normalizedRepoId)

          if (statusResponse.status === "completed") {
            // Verificar si acabamos de completar (transición de indexing a completed)
            const wasIndexing = status === "indexing"
            
            setStatus("completed")
            
            // Mostrar notificación cuando se completa la indexación
            if (wasIndexing) {
              const fileCount = statusResponse.stats?.totalFiles || 0
              toast.success("Repositorio indexado correctamente", {
                description: `El repositorio ${statusResponse.owner || owner}/${statusResponse.repo || repo} ha sido indexado exitosamente. ${fileCount} archivos procesados.`,
                duration: 5000,
              })
            }
            
            // Actualizar preferencias cuando se completa la indexación
            updateUserPreferences(normalizedRepoId).catch((err) => {
              console.error("Error al actualizar preferencias:", err)
            })
            // Cargar métricas cuando el índice está completado (usar owner/repo que ya tenemos)
            loadMetrics(owner, repo).catch((err) => {
              console.error("Error al cargar métricas:", err)
            })
            // Detener polling cuando se completa
            stopPolling()
          } else if (statusResponse.status === "error") {
            setStatus("error")
            setError("Error durante la indexación")
            stopPolling()
          } else if (statusResponse.status === "indexing") {
            // Está indexando
            setCurrentIndex(null)
            setCurrentMetrics(null)
            setStatus("indexing")
          } else if (statusResponse.status === "not_found") {
            // No existe índice y tampoco está indexando
            setCurrentIndex(null)
            setCurrentMetrics(null)
            setStatus("idle")
            stopPolling()
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
      [stopPolling, updateUserPreferences, loadMetrics, status]
    )

  /**
   * Indexa un repositorio completo
   */
  const indexRepository = useCallback(
    async (owner: string, repo: string, branch: string = "main") => {
      // Validar owner y repo antes de continuar
      if (!owner || !repo || typeof owner !== "string" || typeof repo !== "string") {
        const errorMessage = `owner o repo inválidos: owner="${owner}", repo="${repo}"`
        console.warn(`[indexRepository] ${errorMessage}`)
        setError(errorMessage)
        setStatus("error")
        return
      }

      setLoading(true)
      setError(null)
      setStatus("indexing")
      const repositoryId = buildRepositoryId(owner, repo)
      if (!repositoryId) {
        const errorMessage = `No se pudo construir repositoryId válido para owner="${owner}", repo="${repo}"`
        console.warn(`[indexRepository] ${errorMessage}`)
        setError(errorMessage)
        setStatus("error")
        setLoading(false)
        return
      }
      setRepositoryId(repositoryId)
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
        await updateUserPreferences(repositoryId)

        // Iniciar polling automático (sin branch)
        startPolling(owner, repo)
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
      // Validar owner y repo antes de continuar
      if (!owner || !repo || typeof owner !== "string" || typeof repo !== "string") {
        const errorMessage = `owner o repo inválidos: owner="${owner}", repo="${repo}"`
        console.warn(`[reindexRepository] ${errorMessage}`)
        setError(errorMessage)
        setStatus("error")
        return
      }

      setLoading(true)
      setError(null)
      setStatus("indexing")
      const repositoryId = buildRepositoryId(owner, repo)
      if (!repositoryId) {
        const errorMessage = `No se pudo construir repositoryId válido para owner="${owner}", repo="${repo}"`
        console.warn(`[reindexRepository] ${errorMessage}`)
        setError(errorMessage)
        setStatus("error")
        setLoading(false)
        return
      }
      setRepositoryId(repositoryId)
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
        await updateUserPreferences(repositoryId)

        // Iniciar polling automático (sin branch)
        startPolling(owner, repo)
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
      // Validar owner y repo antes de continuar
      if (!owner || !repo || typeof owner !== "string" || typeof repo !== "string") {
        console.warn(`[refreshStatus] owner o repo inválidos: owner="${owner}", repo="${repo}"`)
        setLoading(false)
        return
      }

      setLoading(true)
      setError(null)

      try {
        const repositoryId = buildRepositoryId(owner, repo)
        if (!repositoryId) {
          console.warn(`[refreshStatus] No se pudo construir repositoryId válido para owner="${owner}", repo="${repo}"`)
          setLoading(false)
          return
        }

        // Guard clause adicional: no hacer fetch si repositoryId es inválido
        if (repositoryId === "undefined" || repositoryId.includes("undefined") || repositoryId.includes("null")) {
          console.warn(`[refreshStatus] repositoryId inválido: "${repositoryId}"`)
          setLoading(false)
          return
        }

        const response = await fetch(
          `/api/repository/status?repositoryId=${encodeURIComponent(repositoryId)}`
        )

        // Manejar 400/404 como estado final: no existe índice
        if (response.status === 400 || response.status === 404) {
          setCurrentIndex(null)
          setCurrentMetrics(null)
          setStatus("idle")
          // Limpiar preferencias si el repositorio no existe
          await updateUserPreferences(null)
          return
        }

        if (!response.ok) {
          throw new Error(`Error al obtener estado: ${response.statusText}`)
        }

        const data = await response.json()

        // El endpoint /status solo devuelve metadata (status, repositoryId, stats, owner, repo, indexedAt)
        // NO devuelve files - currentIndex solo se setea cuando hay un índice completo real
        const statusResponse = data as { 
          repositoryId: string
          status: string
          owner?: string
          repo?: string
          stats?: { totalFiles?: number }
          indexedAt?: string
        }
        
        // Normalizar repositoryId al formato github:owner:repo
        let normalizedRepoId: string | null = null
        if (statusResponse.repositoryId.startsWith("github:")) {
          normalizedRepoId = statusResponse.repositoryId
        } else {
          normalizedRepoId = buildRepositoryId(owner, repo)
        }

        // Validar que normalizedRepoId sea válido
        if (!normalizedRepoId) {
          console.warn(`[refreshStatus] No se pudo normalizar repositoryId. statusResponse.repositoryId="${statusResponse.repositoryId}", owner="${owner}", repo="${repo}"`)
          setLoading(false)
          return
        }

        setRepositoryId(normalizedRepoId)

        if (statusResponse.status === "indexing") {
          // Está indexando
          setCurrentIndex(null)
          setCurrentMetrics(null)
          setStatus("indexing")
          // Actualizar preferencias aunque esté indexando
          await updateUserPreferences(normalizedRepoId)
          // Iniciar polling (solo si no hay uno activo)
          if (!pollingRef.current.intervalId) {
            startPolling(owner, repo)
          }
        } else if (statusResponse.status === "completed") {
          setStatus("completed")
          // Actualizar preferencias cuando se restaura un repositorio completado
          // Usar normalizedRepoId que ya está normalizado al formato correcto
          await updateUserPreferences(normalizedRepoId)
          // Cargar métricas cuando el índice está completado (usar owner/repo que ya tenemos)
          await loadMetrics(owner, repo, branch)
        } else if (statusResponse.status === "not_found") {
          // No existe índice y tampoco está indexando
          setCurrentIndex(null)
          setCurrentMetrics(null)
          setStatus("idle")
          // Limpiar preferencias si el repositorio no existe
          await updateUserPreferences(null)
        } else {
          setStatus("error")
          setError("Error en el índice")
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
        // Obtener token de autenticación
        const auth = getAuth()
        const currentUser = auth.currentUser
        if (!currentUser) {
          console.error("No hay usuario autenticado para restaurar preferencias")
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
          console.error("Error al obtener preferencias de usuario")
          setPreferencesLoaded(true)
          return
        }

        const preferences = await response.json()
        if (preferences.activeRepositoryId) {
          // Parsear repositoryId (formato: "github:owner:repo" o "owner/repo" para compatibilidad)
          const parsed = parseRepositoryIdFromPrefs(preferences.activeRepositoryId)
          if (parsed) {
            // Restaurar el repositorio usando refreshStatus
            // Esto cargará el índice completo si existe
            await refreshStatus(parsed.owner, parsed.repo)
          } else {
            // Formato inválido: loguear warning y salir silenciosamente
            console.warn(
              `[restoreActiveRepository] Formato inválido de activeRepositoryId: "${preferences.activeRepositoryId}". Se omite la restauración.`
            )
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
    preferencesLoaded,
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


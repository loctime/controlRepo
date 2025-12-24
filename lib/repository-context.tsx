"use client"

import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from "react"
import { RepositoryIndex, IndexedFile, FileCategory, FileType } from "./types/repository"
import { searchFiles as searchFilesUtil } from "./repository/search"

type RepositoryStatus = "idle" | "indexing" | "completed" | "error"

interface RepositoryContextType {
  // Estado
  currentIndex: RepositoryIndex | null
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
  const [status, setStatus] = useState<RepositoryStatus>("idle")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [repositoryId, setRepositoryId] = useState<string | null>(null)

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
              setStatus("indexing")
            } else if (partialResponse.status === "not_found") {
              // No existe índice y tampoco está indexando
              setCurrentIndex(null)
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
    [stopPolling]
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

      try {
        const response = await fetch("/api/repository/index", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ owner, repo, branch }),
        })

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}))
          throw new Error(errorData.error || `Error al indexar: ${response.statusText}`)
        }

        const data = await response.json()

        // Iniciar polling automático
        startPolling(owner, repo, branch)
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : "Error desconocido al indexar"
        setError(errorMessage)
        setStatus("error")
        setRepositoryId(null)
        stopPolling()
      } finally {
        setLoading(false)
      }
    },
    [startPolling, stopPolling]
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

        // Iniciar polling automático
        startPolling(owner, repo, branch)
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : "Error desconocido al re-indexar"
        setError(errorMessage)
        setStatus("error")
        setRepositoryId(null)
        stopPolling()
      } finally {
        setLoading(false)
      }
    },
    [startPolling, stopPolling]
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
            setStatus("indexing")
            // Iniciar polling (solo si no hay uno activo)
            if (!pollingRef.current.intervalId) {
              startPolling(owner, repo, branch)
            }
          } else if (partialResponse.status === "not_found") {
            // No existe índice y tampoco está indexando
            setCurrentIndex(null)
            setStatus("idle")
          }
        }
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : "Error desconocido al refrescar"
        setError(errorMessage)
        setStatus("error")
      } finally {
        setLoading(false)
      }
    },
    [startPolling]
  )

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


"use client"

import { useEffect, useState } from "react"
import { getAuth } from "firebase/auth"
import { Button } from "@/components/ui/button"
import { Loader2, Github, X, RefreshCw } from "lucide-react"

interface GitHubRepo {
  id: number
  fullName: string
  owner: string
  name: string
  defaultBranch: string
  private: boolean
  updatedAt: string
}

interface GitHubRepoSelectorProps {
  isOpen: boolean
  onClose: () => void
  onSelect: (repo: {
    owner: string
    repo: string
    branch: string
  }) => void
}

export function GitHubRepoSelector({
  isOpen,
  onClose,
  onSelect,
}: GitHubRepoSelectorProps) {
  const [repos, setRepos] = useState<GitHubRepo[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const loadRepos = async () => {
    try {
      setLoading(true)
      setError(null)

      console.log("[GitHubRepoSelector] Cargando repositorios...")

      const auth = getAuth()
      const user = auth.currentUser

      if (!user) {
        const errorMessage = "Usuario no autenticado"
        console.error("[GitHubRepoSelector] Error:", errorMessage)
        throw new Error(errorMessage)
      }

      const token = await user.getIdToken()

      // Agregar timeout de 15 segundos
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 15000)

      let res: Response
      try {
        res = await fetch(
          `${process.env.NEXT_PUBLIC_CONTROLFILE_URL}/api/github/repos`,
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
          throw new Error("Timeout: La carga de repositorios tardó más de 15 segundos")
        }
        throw fetchError
      }

      console.log("[GitHubRepoSelector] Respuesta del backend:", {
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
          // Respuesta no es JSON
        }
        
        const errorMessage = errorData.error || `Error ${res.status}: ${res.statusText || "No se pudieron cargar los repositorios"}`
        
        console.error("[GitHubRepoSelector] Error del backend:", {
          status: res.status,
          statusText: res.statusText,
          error: errorMessage,
          timestamp: new Date().toISOString(),
        })
        
        throw new Error(errorMessage)
      }

      // Parsear respuesta JSON con protección
      let data: any = {}
      try {
        const text = await res.text()
        if (text) {
          data = JSON.parse(text)
        }
      } catch (parseError) {
        console.error("[GitHubRepoSelector] Error al parsear respuesta JSON:", {
          error: parseError,
        })
        throw new Error("Respuesta inválida del servidor")
      }
      
      const reposList = data.repos || []
      
      console.log("[GitHubRepoSelector] Repositorios cargados:", {
        count: reposList.length,
      })
      
      setRepos(reposList)
    } catch (err: any) {
      const errorMessage = err.message || "Error cargando repositorios"
      console.error("[GitHubRepoSelector] Excepción:", {
        error: errorMessage,
        exception: err,
      })
      setError(errorMessage)
    } finally {
      setLoading(false)
      console.log("[GitHubRepoSelector] Finalizado, loading=false")
    }
  }

  useEffect(() => {
    if (!isOpen) return
    loadRepos()
  }, [isOpen])

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center">
      <div className="bg-background rounded-lg shadow-lg w-full max-w-lg p-4 space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Github className="h-5 w-5" />
            <h2 className="text-lg font-semibold">Seleccionar repositorio</h2>
          </div>
          <Button size="icon-sm" variant="ghost" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>

        {/* Content */}
        {loading && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Cargando repositorios…
          </div>
        )}

        {error && (
          <div className="space-y-2">
            <p className="text-sm text-destructive">{error}</p>
            <Button
              size="sm"
              variant="outline"
              onClick={loadRepos}
              disabled={loading}
            >
              {loading ? (
                <>
                  <Loader2 className="h-3 w-3 animate-spin mr-2" />
                  Cargando...
                </>
              ) : (
                <>
                  <RefreshCw className="h-3 w-3 mr-2" />
                  Reintentar
                </>
              )}
            </Button>
          </div>
        )}

        {!loading && !error && repos.length === 0 && (
          <p className="text-sm text-muted-foreground">
            No se encontraron repositorios.
          </p>
        )}

        <div className="max-h-80 overflow-y-auto space-y-2">
          {repos.map((repo) => (
            <div
              key={repo.id}
              className="flex items-center justify-between gap-2 p-2 rounded-md border hover:bg-muted/50"
            >
              <div className="min-w-0">
                <p className="font-mono text-sm truncate">
                  {repo.fullName}
                </p>
                <p className="text-xs text-muted-foreground">
                  branch: {repo.defaultBranch}
                  {repo.private ? " · privado" : ""}
                </p>
              </div>

              <Button
                size="sm"
                onClick={() => {
                  onSelect({
                    owner: repo.owner,
                    repo: repo.name,
                    branch: repo.defaultBranch,
                  })
                  onClose()
                }}
              >
                Usar
              </Button>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

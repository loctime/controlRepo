"use client"

import { useEffect, useState } from "react"
import { getAuth } from "firebase/auth"
import { Button } from "@/components/ui/button"
import { Loader2, Github, X } from "lucide-react"

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

  useEffect(() => {
    if (!isOpen) return

    const loadRepos = async () => {
      try {
        setLoading(true)
        setError(null)

        const auth = getAuth()
        const user = auth.currentUser

        if (!user) {
          throw new Error("Usuario no autenticado")
        }

        const token = await user.getIdToken()

        const res = await fetch(
          `${process.env.NEXT_PUBLIC_CONTROLFILE_URL}/api/github/repos`,
          {
            headers: {
              Authorization: `Bearer ${token}`,
            },
          }
        )

        if (!res.ok) {
          throw new Error("No se pudieron cargar los repositorios")
        }

        const data = await res.json()
        setRepos(data.repos || [])
      } catch (err: any) {
        setError(err.message || "Error cargando repositorios")
      } finally {
        setLoading(false)
      }
    }

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
          <p className="text-sm text-destructive">{error}</p>
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

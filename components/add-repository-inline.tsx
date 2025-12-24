"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { useRepository } from "@/lib/repository-context"
import { Loader2, X } from "lucide-react"

interface AddRepositoryInlineProps {
  isOpen: boolean
  onClose: () => void
}

/**
 * Parsea una URL de GitHub y extrae owner, repo y branch
 * @param url URL de GitHub (ej: https://github.com/owner/repo o https://github.com/owner/repo/tree/branch)
 * @returns { owner, repo, branch } o null si la URL es inválida
 */
function parseGitHubUrl(url: string): { owner: string; repo: string; branch: string } | null {
  // Limpiar espacios y normalizar
  const cleanUrl = url.trim()

  // Patrón para URLs de GitHub
  // https://github.com/owner/repo
  // https://github.com/owner/repo/tree/branch
  // https://github.com/owner/repo.git
  const githubPattern = /^https?:\/\/(?:www\.)?github\.com\/([a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?)\/([a-zA-Z0-9]([a-zA-Z0-9._-]*[a-zA-Z0-9])?)(?:\/tree\/([a-zA-Z0-9._-]+))?(?:\.git)?\/?$/

  const match = cleanUrl.match(githubPattern)

  if (!match) {
    return null
  }

  const owner = match[1]
  const repo = match[3] // El repo está en el grupo 3 (grupo 2 es parte interna del owner)
  const branch = match[5] || "main" // Si no hay branch, usar "main"

  // Verificar que owner y repo sean válidos
  if (!owner || !repo) {
    return null
  }

  return { owner, repo, branch }
}

export function AddRepositoryInline({ isOpen, onClose }: AddRepositoryInlineProps) {
  const { indexRepository, loading, status } = useRepository()
  const [url, setUrl] = useState("")
  const [error, setError] = useState<string | null>(null)

  // Resetear al cerrar
  useEffect(() => {
    if (!isOpen) {
      setUrl("")
      setError(null)
    }
  }, [isOpen])

  // Prevenir múltiples indexaciones simultáneas
  const isSubmitting = loading || status === "indexing"

  // Handler para indexar repositorio
  const handleIndex = async () => {
    if (!url.trim()) {
      setError("La URL es requerida")
      return
    }

    // Parsear URL
    const parsed = parseGitHubUrl(url.trim())

    if (!parsed) {
      setError("URL de GitHub inválida. Formato esperado: https://github.com/owner/repo")
      return
    }

    try {
      await indexRepository(parsed.owner, parsed.repo, parsed.branch)
      // Colapsar y limpiar después de iniciar indexación
      setUrl("")
      setError(null)
      onClose()
    } catch (err) {
      // El error ya se maneja en el contexto
      console.error("Error al indexar repositorio:", err)
    }
  }

  // Handler para cambio de input
  const handleUrlChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value
    setUrl(value)
    // Limpiar error al escribir
    if (error) {
      setError(null)
    }
  }

  // Handler para Enter
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && !isSubmitting && url.trim()) {
      handleIndex()
    }
  }

  if (!isOpen) {
    return null
  }

  return (
    <div className="flex items-start gap-2 p-3 bg-muted/50 rounded-md border border-border">
      <div className="flex-1 space-y-2">
        <Input
          placeholder="https://github.com/owner/repo"
          value={url}
          onChange={handleUrlChange}
          onKeyDown={handleKeyDown}
          disabled={isSubmitting}
          aria-invalid={error ? "true" : "false"}
          className="font-mono text-sm"
        />
        {error ? (
          <p className="text-xs text-destructive">{error}</p>
        ) : (
          <p className="text-xs text-muted-foreground">
            Pegá la URL del repositorio de GitHub
          </p>
        )}
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <Button
          size="sm"
          onClick={handleIndex}
          disabled={isSubmitting || !url.trim()}
        >
          {isSubmitting ? (
            <>
              <Loader2 className="h-3 w-3 animate-spin" />
              Indexando...
            </>
          ) : (
            "Indexar"
          )}
        </Button>
        <Button
          size="icon-sm"
          variant="ghost"
          onClick={onClose}
          disabled={isSubmitting}
          className="shrink-0"
        >
          <X className="h-4 w-4" />
          <span className="sr-only">Cerrar</span>
        </Button>
      </div>
    </div>
  )
}


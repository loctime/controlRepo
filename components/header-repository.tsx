"use client"

import { useState } from "react"

import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Plus,
  Loader2,
  AlertCircle,
  GitBranch,
  RefreshCw,
  Github,
} from "lucide-react"
import { useRepository } from "@/lib/repository-context"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { AddRepositoryInline } from "./add-repository-inline"
import { GitHubRepoSelector } from "./github-repo-selector"
import { useGitHubConnection } from "@/hooks/use-github-connection"

export function HeaderRepository() {
  const { repositoryId, status, loading, statusData, indexRepository, refreshStatus, error: repoError } =
    useRepository()

  const [dialogOpen, setDialogOpen] = useState(false)
  const [githubSelectorOpen, setGithubSelectorOpen] = useState(false)
  const [reindexing, setReindexing] = useState(false)
  
  // Usar el nuevo hook con estados explícitos
  const { state: githubState, error: githubError, checkStatus, connect, isChecking } = useGitHubConnection()

  // Parsear repositoryId para obtener owner/repo
  const parsedRepo = repositoryId
    ? (() => {
        const parts = repositoryId.replace("github:", "").split(":")
        return parts.length === 2 ? { owner: parts[0], repo: parts[1] } : null
      })()
    : null

  // Determinar si GitHub está conectado basado en el estado explícito
  const githubConnected = githubState === "connected"
  
  /* =======================
     Handlers
  ======================= */
  const handleReindex = async () => {
    if (!repositoryId || reindexing) return
    setReindexing(true)
    try {
      await indexRepository(repositoryId, true) // force = true
    } finally {
      setReindexing(false)
    }
  }

  const handleSelectGitHubRepo = async (repo: {
    owner: string
    repo: string
    branch: string
  }) => {
    // Construir repositoryId según contrato: github:owner:repo
    const repoId = `github:${repo.owner}:${repo.repo}`
    await indexRepository(repoId)
  }

  const repositoryDisplay = parsedRepo
    ? `${parsedRepo.owner}/${parsedRepo.repo}`
    : repositoryId || "Sin repositorio"

  /* =======================
     Render
  ======================= */
  return (
    <div
      className="flex flex-col flex-1 min-w-0 rounded-md"
    >
      <div className="grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-2 min-w-0">
        {/* Repo */}
        <div className="flex items-center gap-2 min-w-0">
          <GitBranch className="h-3.5 w-3.5 text-muted-foreground shrink-0" />

          <Tooltip>
            <TooltipTrigger asChild>
              {githubConnected ? (
                <button
                  onClick={() => setGithubSelectorOpen(true)}
                  className="font-mono text-xs truncate px-2 py-1 rounded-md border bg-muted/30 hover:bg-muted/50 cursor-pointer transition-colors"
                >
                  {repositoryDisplay}
                </button>
              ) : (
                <span className="font-mono text-xs truncate px-2 py-1 rounded-md border bg-muted/30">
                  {repositoryDisplay}
                </span>
              )}
            </TooltipTrigger>
            <TooltipContent>
              <p className="font-mono">{repositoryDisplay}</p>
              {githubConnected && (
                <p className="text-xs mt-1">Click para seleccionar otro repositorio</p>
              )}
            </TooltipContent>
          </Tooltip>

        </div>

        {/* Estado */}
        <div>
          {status === "indexing" && (
            <Badge variant="secondary" className="gap-1 h-6 text-xs">
              <Loader2 className="h-3 w-3 animate-spin" />
              Indexando…
            </Badge>
          )}

          {status === "completed" && (
            <Badge variant="default" className="gap-1 h-6 text-xs">
              Listo
            </Badge>
          )}

          {status === "idle" && (
            <Badge variant="outline" className="gap-1 h-6 text-xs">
              Sin indexar
            </Badge>
          )}

          {status === "error" && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Badge variant="destructive" className="gap-1 h-6 text-xs">
                  <AlertCircle className="h-3 w-3" />
                  Error
                </Badge>
              </TooltipTrigger>
              {repoError && (
                <TooltipContent>
                  <p className="max-w-xs">{repoError}</p>
                </TooltipContent>
              )}
            </Tooltip>
          )}
        </div>

        {/* Acciones */}
        <div className="flex items-center gap-1.5 shrink-0">
          {status === "completed" && repositoryId && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleReindex}
                  disabled={reindexing}
                  className="h-6 text-xs gap-1"
                >
                  {reindexing ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    <RefreshCw className="h-3 w-3" />
                  )}
                  Actualizar repo
                </Button>
              </TooltipTrigger>
              <TooltipContent>Actualizar repositorio</TooltipContent>
            </Tooltip>
          )}

          {status === "idle" && repositoryId && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  size="sm"
                  variant="default"
                  onClick={() => indexRepository(repositoryId)}
                  disabled={loading || githubState !== "connected"}
                  className="h-6 text-xs gap-1"
                >
                  {loading ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    <Plus className="h-3 w-3" />
                  )}
                  Indexar
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                {githubState !== "connected" 
                  ? "Conectá GitHub primero para indexar"
                  : "Indexar repositorio"}
              </TooltipContent>
            </Tooltip>
          )}

          {status === "error" && repositoryId && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => indexRepository(repositoryId, true)}
                  disabled={loading || reindexing || githubState !== "connected"}
                  className="h-6 text-xs gap-1"
                >
                  {loading || reindexing ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    <RefreshCw className="h-3 w-3" />
                  )}
                  Reintentar
                </Button>
              </TooltipTrigger>
              <TooltipContent>Reintentar indexación</TooltipContent>
            </Tooltip>
          )}

          {/* Botón de GitHub con estados explícitos */}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                size="icon-sm"
                variant={
                  githubState === "connected" 
                    ? "secondary" 
                    : githubState === "error"
                    ? "destructive"
                    : "ghost"
                }
                onClick={async () => {
                  if (githubState === "connected") {
                    // Si está conectado, permitir reconectar manualmente (fallback)
                    await checkStatus()
                  } else if (githubState === "error") {
                    // Si hay error, reintentar verificación
                    await checkStatus()
                  } else {
                    // Si no está conectado, iniciar flujo OAuth
                    await connect()
                  }
                }}
                className="h-6 w-6"
                disabled={isChecking || githubState === "connecting"}
              >
                {isChecking || githubState === "connecting" ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : githubState === "error" ? (
                  <AlertCircle className="h-4 w-4" />
                ) : (
                  <Github className="h-4 w-4" />
                )}
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              {githubState === "connected" && (
                <div>
                  <p>GitHub conectado</p>
                  <p className="text-xs mt-1 text-muted-foreground">Click para verificar estado</p>
                </div>
              )}
              {githubState === "connecting" && (
                <p>Verificando conexión...</p>
              )}
              {githubState === "not_connected" && (
                <p>Conectar GitHub</p>
              )}
              {githubState === "error" && (
                <div>
                  <p>Error de conexión</p>
                  {githubError && (
                    <p className="text-xs mt-1 text-destructive max-w-xs">{githubError}</p>
                  )}
                  <p className="text-xs mt-1 text-muted-foreground">Click para reintentar</p>
                </div>
              )}
            </TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                size="icon-sm"
                variant="outline"
                onClick={() => setDialogOpen(true)}
                className="h-6 w-6"
              >
                <Plus className="h-3 w-3" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Indexar repositorio</TooltipContent>
          </Tooltip>
        </div>
      </div>

      <AddRepositoryInline
        isOpen={dialogOpen}
        onClose={() => setDialogOpen(false)}
      />

      <GitHubRepoSelector
        isOpen={githubSelectorOpen}
        onClose={() => setGithubSelectorOpen(false)}
        onSelect={handleSelectGitHubRepo}
      />
    </div>
  )
}

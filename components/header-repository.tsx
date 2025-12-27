"use client"

import { useState, useEffect } from "react"
import { getAuth } from "firebase/auth"

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
  AlertTriangle,
  Github,
} from "lucide-react"
import { useRepository } from "@/lib/repository-context"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { AddRepositoryInline } from "./add-repository-inline"
import { GitHubRepoSelector } from "./github-repo-selector"

export function HeaderRepository() {
  const { repositoryId, status, loading, currentIndex, reindexRepository, indexRepository } =
    useRepository()

  const [dialogOpen, setDialogOpen] = useState(false)
  const [githubSelectorOpen, setGithubSelectorOpen] = useState(false)
  const [branches, setBranches] = useState<string[]>([])
  const [loadingBranches, setLoadingBranches] = useState(false)
  const [hasUpdates, setHasUpdates] = useState(false)
  const [reindexing, setReindexing] = useState(false)
  const [githubConnected, setGithubConnected] = useState<boolean | null>(null)

  /* =======================
     Cargar ramas
  ======================= */
  useEffect(() => {
    if (currentIndex?.owner && currentIndex?.repo && status === "completed") {
      setLoadingBranches(true)
      fetch(
        `/api/repository/branches?owner=${encodeURIComponent(
          currentIndex.owner
        )}&repo=${encodeURIComponent(currentIndex.repo)}`
      )
        .then((res) => res.json())
        .then((data) => setBranches(data.branches || []))
        .catch(() => setBranches([]))
        .finally(() => setLoadingBranches(false))
    }
  }, [currentIndex?.owner, currentIndex?.repo, status])

  /* =======================
     Verificar updates
  ======================= */
  useEffect(() => {
    if (!currentIndex || status !== "completed") {
      setHasUpdates(false)
      return
    }

    const check = async () => {
      try {
        const res = await fetch(
          `/api/repository/check-updates?owner=${encodeURIComponent(
            currentIndex.owner
          )}&repo=${encodeURIComponent(
            currentIndex.repo
          )}&branch=${encodeURIComponent(currentIndex.branch)}`
        )
        if (res.ok) {
          const data = await res.json()
          setHasUpdates(Boolean(data.hasUpdates))
        }
      } catch {
        setHasUpdates(false)
      }
    }

    check()
    const id = setInterval(check, 30000)
    return () => clearInterval(id)
  }, [currentIndex, status])


  useEffect(() => {
    const checkGithubStatus = async () => {
      try {
        const auth = getAuth()
        const user = auth.currentUser
  
        if (!user) {
          setGithubConnected(false)
          return
        }
  
        const token = await user.getIdToken()
  
        const res = await fetch(
          `${process.env.NEXT_PUBLIC_CONTROLFILE_URL}/api/github/status`,
          {
            headers: {
              Authorization: `Bearer ${token}`,
            },
          }
        )
  
        if (!res.ok) {
          setGithubConnected(false)
          return
        }
  
        const data = await res.json()
        setGithubConnected(Boolean(data.connected))
      } catch (err) {
        setGithubConnected(false)
      }
    }
  
    checkGithubStatus()
  }, [])
  
  
  /* =======================
     Handlers
  ======================= */
  const handleBranchChange = async (branch: string) => {
    if (!currentIndex || branch === currentIndex.branch) return
    await reindexRepository(currentIndex.owner, currentIndex.repo, branch)
  }

  const handleReindex = async () => {
    if (!currentIndex || reindexing) return
    setReindexing(true)
    try {
      await reindexRepository(
        currentIndex.owner,
        currentIndex.repo,
        currentIndex.branch
      )
      setHasUpdates(false)
    } finally {
      setReindexing(false)
    }
  }

  const handleSelectGitHubRepo = async (repo: {
    owner: string
    repo: string
    branch: string
  }) => {
    await indexRepository(repo.owner, repo.repo, repo.branch)
  }

  const repositoryDisplay = currentIndex
    ? `${currentIndex.owner}/${currentIndex.repo}@${currentIndex.branch}`
    : repositoryId || "Sin repositorio"

  /* =======================
     Render
  ======================= */
  return (
    <div
      className={`flex flex-col flex-1 min-w-0 rounded-md ${
        hasUpdates
          ? "bg-amber-500/10 border border-amber-500/40 p-2"
          : ""
      }`}
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

          {hasUpdates && (
            <span className="flex items-center gap-1 text-xs text-amber-700">
              <AlertTriangle className="h-3 w-3" />
              Hay cambios sin indexar
            </span>
          )}
        </div>

        {/* Estado */}
        <div>
          {status === "indexing" && (
            <Badge variant="secondary" className="gap-1 h-6 text-xs">
              <Loader2 className="h-3 w-3 animate-spin" />
              Indexando…
            </Badge>
          )}

          {status === "completed" && currentIndex && branches.length > 0 && (
            <Select
              value={currentIndex.branch}
              onValueChange={handleBranchChange}
              disabled={loadingBranches || loading}
            >
              <SelectTrigger className="h-6 text-xs">
                <GitBranch className="h-3 w-3" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {branches.map((b) => (
                  <SelectItem key={b} value={b}>
                    {b}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}

          {status === "error" && (
            <Badge variant="destructive" className="gap-1 h-6 text-xs">
              <AlertCircle className="h-3 w-3" />
              Error
            </Badge>
          )}
        </div>

        {/* Acciones */}
        <div className="flex items-center gap-1.5 shrink-0">
          {status === "completed" && currentIndex && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  size="sm"
                  variant={hasUpdates ? "default" : "outline"}
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

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                size="icon-sm"
                variant={githubConnected ? "secondary" : "ghost"}
                onClick={() => {
                  if (!githubConnected) {
                    window.location.href =
                      `${process.env.NEXT_PUBLIC_CONTROLFILE_URL}/api/auth/github`
                  }
                }}
                className="h-6 w-6"
                disabled={githubConnected === null}
              >
                <Github className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              {githubConnected
                ? "GitHub conectado"
                : "Conectar GitHub"}
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

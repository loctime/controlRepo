"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Plus, Loader2, CheckCircle2, AlertCircle, GitBranch, RefreshCw, AlertTriangle } from "lucide-react"
import { useRepository } from "@/lib/repository-context"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { AddRepositoryInline } from "./add-repository-inline"
import { Alert, AlertDescription } from "@/components/ui/alert"

export function HeaderRepository() {
  const { repositoryId, status, loading, currentIndex, reindexRepository } = useRepository()
  const [dialogOpen, setDialogOpen] = useState(false)
  const [branches, setBranches] = useState<string[]>([])
  const [loadingBranches, setLoadingBranches] = useState(false)
  const [hasUpdates, setHasUpdates] = useState(false)
  const [checkingUpdates, setCheckingUpdates] = useState(false)
  const [reindexing, setReindexing] = useState(false)

  // Obtener ramas disponibles cuando hay un índice completado
  useEffect(() => {
    if (currentIndex?.owner && currentIndex?.repo && status === "completed") {
      setLoadingBranches(true)
      fetch(`/api/repository/branches?owner=${encodeURIComponent(currentIndex.owner)}&repo=${encodeURIComponent(currentIndex.repo)}`)
        .then((res) => res.json())
        .then((data) => {
          if (data.branches) {
            setBranches(data.branches)
          }
        })
        .catch((err) => {
          console.error("Error al obtener ramas:", err)
        })
        .finally(() => {
          setLoadingBranches(false)
        })
    }
  }, [currentIndex?.owner, currentIndex?.repo, status])

  // Detección liviana de cambios: verificar si el commit SHA cambió
  useEffect(() => {
    if (!currentIndex || status !== "completed") {
      setHasUpdates(false)
      return
    }

    const checkForUpdates = async () => {
      setCheckingUpdates(true)
      try {
        const response = await fetch(
          `/api/repository/check-updates?owner=${encodeURIComponent(currentIndex.owner)}&repo=${encodeURIComponent(currentIndex.repo)}&branch=${encodeURIComponent(currentIndex.branch)}`
        )
        if (response.ok) {
          const data = await response.json()
          setHasUpdates(data.hasUpdates || false)
        } else if (response.status === 502) {
          // Error de GitHub API (rate limit, repo privado, etc.)
          // No mostrar error, solo no actualizar el estado
          console.warn("No se pudo verificar actualizaciones del repositorio")
          setHasUpdates(false)
        } else {
          // Otro error, no actualizar estado
          setHasUpdates(false)
        }
      } catch (err) {
        console.error("Error al verificar actualizaciones:", err)
        // No romper el flujo si falla la verificación
        setHasUpdates(false)
      } finally {
        setCheckingUpdates(false)
      }
    }

    // Verificar cambios solo cuando el índice está completado
    checkForUpdates()

    // Verificar cambios periódicamente (cada 30 segundos) - operación liviana
    const intervalId = setInterval(checkForUpdates, 30000)

    return () => clearInterval(intervalId)
  }, [currentIndex, status])

  // Handler para cambiar de rama
  const handleBranchChange = async (newBranch: string) => {
    if (!currentIndex || newBranch === currentIndex.branch) return
    
    try {
      await reindexRepository(currentIndex.owner, currentIndex.repo, newBranch)
    } catch (error) {
      console.error("Error al cambiar de rama:", error)
    }
  }

  // Handler para reindexar manualmente
  const handleReindex = async () => {
    if (!currentIndex || reindexing) return
    
    setReindexing(true)
    try {
      await reindexRepository(currentIndex.owner, currentIndex.repo, currentIndex.branch)
      // Resetear el estado de actualizaciones después de reindexar
      setHasUpdates(false)
    } catch (error) {
      console.error("Error al reindexar:", error)
    } finally {
      setReindexing(false)
    }
  }

  // Estado visual del repositorio
  const getStatusBadge = () => {
    switch (status) {
      case "idle":
        return null
      case "indexing":
        return (
          <Badge variant="secondary" className="gap-1 h-6 px-2 text-xs">
            <Loader2 className="h-3 w-3 animate-spin" />
            <span>Indexando...</span>
          </Badge>
        )
      case "completed":
        if (currentIndex && branches.length > 0) {
          return (
            <Select
              value={currentIndex.branch}
              onValueChange={handleBranchChange}
              disabled={loadingBranches || loading}
            >
              <SelectTrigger className="h-6 gap-1 px-2 text-xs border-border bg-muted/50 hover:bg-muted">
                <GitBranch className="h-3 w-3 shrink-0" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {branches.map((branch) => (
                  <SelectItem key={branch} value={branch}>
                    <div className="flex items-center gap-2">
                      <GitBranch className="h-3 w-3" />
                      {branch}
                      {branch === currentIndex.branch && (
                        <CheckCircle2 className="h-3 w-3 text-primary" />
                      )}
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )
        }
        // Fallback si no hay ramas cargadas aún
        return (
          <Badge variant="default" className="gap-1 h-6 px-2 text-xs">
            <GitBranch className="h-3 w-3" />
            <span>{currentIndex?.branch || "Completado"}</span>
          </Badge>
        )
      case "error":
        return (
          <Badge variant="destructive" className="gap-1 h-6 px-2 text-xs">
            <AlertCircle className="h-3 w-3" />
            <span>Error</span>
          </Badge>
        )
      default:
        return null
    }
  }

  // Formatear repositorio para mostrar
  const formatRepository = () => {
    if (!repositoryId) return "Sin repositorio"
    if (currentIndex) {
      return `${currentIndex.owner}/${currentIndex.repo}@${currentIndex.branch}`
    }
    return repositoryId
  }

  // Handler para abrir el modal de agregar repositorio
  const handleAddRepository = () => {
    setDialogOpen(true)
  }

  const repositoryDisplay = formatRepository()

  return (
    <div className="flex flex-col gap-2 flex-1 min-w-0">
      {/* Fila principal: Repositorio + Estado + Botones */}
      <div className="grid grid-cols-[minmax(0,1fr)_auto_auto_auto] items-center gap-2 min-w-0">
        {/* Repositorio activo - Estilo GitHub/Vercel */}
        <div className="flex items-center gap-1.5 min-w-0">
          <GitBranch className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="font-mono text-xs text-foreground truncate min-w-0 px-2 py-1 rounded-md border border-border bg-muted/30 hover:bg-muted/50 transition-colors">
                {repositoryDisplay}
              </span>
            </TooltipTrigger>
            <TooltipContent>
              <p className="font-mono">{repositoryDisplay}</p>
            </TooltipContent>
          </Tooltip>
        </div>

        {/* Estado del repositorio */}
        <div className="shrink-0">
          {getStatusBadge()}
        </div>

        {/* Botón reindexar repositorio (solo visible cuando hay índice completado) */}
        {status === "completed" && currentIndex && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                size="icon-sm"
                variant="outline"
                onClick={handleReindex}
                disabled={loading || reindexing}
                className={`shrink-0 h-6 w-6 border-border ${
                  hasUpdates 
                    ? "bg-amber-500/20 hover:bg-amber-500/30 border-amber-500/50" 
                    : "bg-muted/30 hover:bg-muted/50"
                }`}
              >
                {reindexing ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <RefreshCw className={`h-3.5 w-3.5 ${hasUpdates ? "text-amber-600 dark:text-amber-400" : ""}`} />
                )}
                <span className="sr-only">Reindexar repositorio</span>
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              <p>{hasUpdates ? "Hay actualizaciones disponibles - Reindexar repositorio" : "Reindexar repositorio"}</p>
            </TooltipContent>
          </Tooltip>
        )}

        {/* Botón agregar/indexar repositorio */}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              size="icon-sm"
              variant="outline"
              onClick={handleAddRepository}
              disabled={loading || status === "indexing"}
              className="shrink-0 h-6 w-6 border-border bg-muted/30 hover:bg-muted/50"
            >
              <Plus className="h-3.5 w-3.5" />
              <span className="sr-only">Agregar repositorio</span>
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            <p>Indexar nuevo repositorio</p>
          </TooltipContent>
        </Tooltip>
      </div>

      {/* Aviso de actualizaciones disponibles */}
      {hasUpdates && status === "completed" && currentIndex && (
        <Alert variant="default" className="py-2 px-3 border-amber-500/50 bg-amber-500/10">
          <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400" />
          <AlertDescription className="text-xs text-amber-800 dark:text-amber-200">
            El repositorio tiene actualizaciones disponibles. Haz clic en el botón de reindexar para actualizar el índice.
          </AlertDescription>
        </Alert>
      )}

      {/* Input inline colapsable para agregar repositorio */}
      <AddRepositoryInline isOpen={dialogOpen} onClose={() => setDialogOpen(false)} />
    </div>
  )
}


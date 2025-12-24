"use client"

import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Plus, Loader2, CheckCircle2, AlertCircle, GitBranch } from "lucide-react"
import { useRepository } from "@/lib/repository-context"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"

export function HeaderRepository() {
  const { repositoryId, status, loading, currentIndex, indexRepository } = useRepository()

  // Estado visual del repositorio
  const getStatusBadge = () => {
    switch (status) {
      case "idle":
        return null
      case "indexing":
        return (
          <Badge variant="secondary" className="gap-1">
            <Loader2 className="h-3 w-3 animate-spin" />
            <span>Indexando...</span>
          </Badge>
        )
      case "completed":
        return (
          <Badge variant="default" className="gap-1">
            <CheckCircle2 className="h-3 w-3" />
            <span>Completado</span>
          </Badge>
        )
      case "error":
        return (
          <Badge variant="destructive" className="gap-1">
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

  // Handler para agregar/indexar repositorio (placeholder)
  const handleAddRepository = () => {
    // Placeholder: en el futuro esto abrirá un modal o formulario
    // Por ahora, podemos hacer un ejemplo con un repo hardcodeado para testing
    // En producción esto debería venir de un modal/formulario
    console.log("Agregar repositorio - placeholder")
    // Ejemplo (comentado):
    // indexRepository("usuario", "repo-ejemplo", "main")
  }

  const repositoryDisplay = formatRepository()

  return (
    <div className="flex items-center gap-3 flex-1 min-w-0">
      {/* Repositorio activo - Mostrado como texto/Badge simple */}
      {/* TODO: Cuando haya soporte para múltiples repositorios indexados,
          reintroducir un Select aquí para permitir cambiar entre repositorios */}
      <div className="flex items-center gap-2 min-w-0 flex-1">
        <GitBranch className="h-4 w-4 text-muted-foreground shrink-0" />
        {repositoryId ? (
          <Badge variant="outline" className="font-mono text-xs">
            {repositoryDisplay}
          </Badge>
        ) : (
          <span className="text-sm text-muted-foreground truncate">{repositoryDisplay}</span>
        )}
      </div>

      {/* Estado del repositorio */}
      {getStatusBadge()}

      {/* Botón agregar/indexar repositorio */}
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            size="icon-sm"
            variant="outline"
            onClick={handleAddRepository}
            disabled={loading}
            className="shrink-0"
          >
            <Plus className="h-4 w-4" />
            <span className="sr-only">Agregar repositorio</span>
          </Button>
        </TooltipTrigger>
        <TooltipContent>
          <p>Indexar nuevo repositorio</p>
        </TooltipContent>
      </Tooltip>
    </div>
  )
}


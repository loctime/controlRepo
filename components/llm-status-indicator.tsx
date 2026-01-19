"use client"

import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { useLLMStatus } from "@/hooks/use-llm-status"
import { cn } from "@/lib/utils"

/**
 * Componente que muestra un indicador visual del estado de conexión del LLM
 * 
 * Estados:
 * - 🟢 Verde: Ollama activo (provider === "ollama" y ok === true)
 * - 🔴 Rojo: Backend sin LLM / error (error o ok === false)
 * - 🟡 Amarillo: Conectando / desconocido (estado inicial o timeout)
 */
export function LLMStatusIndicator() {
  const status = useLLMStatus(10000) // Consulta cada 10 segundos

  const getStatusConfig = () => {
    switch (status.status) {
      case "connected":
        return {
          color: "bg-green-500",
          pulse: true,
          label: "Ollama activo",
          tooltip: `Proveedor: ${status.provider || "N/A"}\nModelo: ${status.model || "N/A"}`,
        }
      case "disconnected":
        return {
          color: "bg-red-500",
          pulse: false,
          label: "Backend sin LLM",
          tooltip: status.error ? `Error: ${status.error}` : "Backend sin LLM o error",
        }
      case "unknown":
        return {
          color: "bg-yellow-500",
          pulse: true,
          label: "Conectando",
          tooltip: status.provider
            ? `Proveedor: ${status.provider}${status.model ? `\nModelo: ${status.model}` : ""}`
            : "Estado desconocido",
        }
      case "loading":
      default:
        return {
          color: "bg-yellow-500",
          pulse: true,
          label: "Conectando",
          tooltip: "Verificando estado...",
        }
    }
  }

  const config = getStatusConfig()

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div className="flex items-center gap-2">
          <div
            className={cn(
              "h-2.5 w-2.5 rounded-full",
              config.color,
              config.pulse && "animate-pulse"
            )}
            aria-label={config.label}
            role="status"
          />
        </div>
      </TooltipTrigger>
      <TooltipContent side="bottom" className="whitespace-pre-line">
        <div className="text-xs">
          <div className="font-semibold mb-1">{config.label}</div>
          {config.tooltip && <div className="opacity-90">{config.tooltip}</div>}
        </div>
      </TooltipContent>
    </Tooltip>
  )
}

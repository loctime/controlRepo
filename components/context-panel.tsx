"use client"

import { useState } from "react"
import { Card } from "@/components/ui/card"
import { ScrollArea } from "@/components/ui/scroll-area"
import { FileCode, FileText, ChevronUp, ChevronDown } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { useContextFiles } from "@/lib/context-files-context"

function getFileType(path: string): "component" | "utility" | "config" | "docs" {
  if (path.endsWith(".md") || path.includes("docs/") || path.includes("README")) {
    return "docs"
  }
  if (path.includes("components/") || path.endsWith(".tsx") || path.endsWith(".jsx")) {
    return "component"
  }
  if (path.includes("config") || path.includes(".config.") || path.includes(".json")) {
    return "config"
  }
  return "utility"
}

export function ContextPanel({ compact }: { compact?: boolean }) {
  const [open, setOpen] = useState(false)
  const { contextFiles } = useContextFiles()

  return (
    <div className="relative inline-block">
      <div className={`flex items-center ${compact ? "gap-2" : "gap-3"}`}>
        {!compact && (
          <div className="text-right">
            <p className="text-sm font-medium">Archivos de Contexto</p>
            <p className="text-xs text-muted-foreground">Última respuesta</p>
          </div>
        )}

        <button
          aria-expanded={open}
          onClick={() => setOpen((s) => !s)}
          className="inline-flex items-center gap-2 rounded-md px-3 py-1 text-sm hover:bg-accent transition"
        >
          <span className="sr-only">Archivos de contexto</span>
          <span className={`${compact ? "text-sm font-medium" : "hidden sm:inline"}`}>{open ? "Ocultar" : compact ? "Ver archivos" : "Ver"}</span>
          {open ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </button>
      </div>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-[28rem] z-50">
          <Card className="border-border py-0 gap-0">
            <div className="px-3 py-2 border-b border-border">
              <h4 className="font-semibold">Archivos de Contexto</h4>
              <p className="text-xs text-muted-foreground mt-1">Archivos utilizados para la última respuesta</p>
            </div>
            <div className="max-h-[45vh]">
              <ScrollArea className="p-3">
                {contextFiles.length === 0 ? (
                  <div className="py-8 text-center">
                    <p className="text-sm text-muted-foreground">No hay archivos de contexto</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {contextFiles.map((file, index) => {
                      const fileType = getFileType(file.path)
                      return (
                        <div
                          key={index}
                          className="flex items-start gap-3 p-3 rounded-lg border border-border hover:bg-accent transition-colors"
                        >
                          <div className="mt-0.5">
                            {fileType === "docs" ? (
                              <FileText className="h-4 w-4 text-muted-foreground" />
                            ) : (
                              <FileCode className="h-4 w-4 text-muted-foreground" />
                            )}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-foreground truncate">{file.name}</p>
                            <p className="text-xs text-muted-foreground truncate mt-0.5">{file.path}</p>
                          </div>
                          <Badge variant="secondary" className="text-xs shrink-0">
                            {fileType}
                          </Badge>
                        </div>
                      )
                    })}
                  </div>
                )}
              </ScrollArea>
            </div>
          </Card>
        </div>
      )}
    </div>
  )
}

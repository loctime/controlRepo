"use client"

import { useState } from "react"
import { Card } from "@/components/ui/card"
import { ScrollArea } from "@/components/ui/scroll-area"
import { FileCode, FileText, ChevronUp, ChevronDown } from "lucide-react"
import { Badge } from "@/components/ui/badge"

interface ContextFile {
  name: string
  path: string
  type: "component" | "utility" | "config" | "docs"
}

const sampleFiles: ContextFile[] = [
  { name: "README.md", path: "/docs/README.md", type: "docs" },
  { name: "auth.ts", path: "/lib/auth.ts", type: "utility" },
  { name: "UserProfile.tsx", path: "/components/UserProfile.tsx", type: "component" },
  { name: "next.config.js", path: "/next.config.js", type: "config" },
]

export function ContextPanel({ compact }: { compact?: boolean }) {
  const [open, setOpen] = useState(false)

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
          <Card className="border-border">
            <div className="p-3 border-b border-border">
              <h4 className="font-semibold">Archivos de Contexto</h4>
              <p className="text-xs text-muted-foreground mt-1">Archivos utilizados para la última respuesta</p>
            </div>
            <div className="max-h-[45vh]">
              <ScrollArea className="p-4">
                <div className="space-y-3">
                  {sampleFiles.map((file, index) => (
                    <div
                      key={index}
                      className="flex items-start gap-3 p-3 rounded-lg border border-border hover:bg-accent transition-colors"
                    >
                      <div className="mt-0.5">
                        {file.type === "docs" ? (
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
                        {file.type}
                      </Badge>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            </div>
          </Card>
        </div>
      )}
    </div>
  )
}

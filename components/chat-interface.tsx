"use client"

import { useState, useRef, useEffect } from "react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Send, Bot, User, X } from "lucide-react"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { ContextPanel } from "./context-panel"
import { useRepository } from "@/lib/repository-context"
import { useContextFiles } from "@/lib/context-files-context"
import { Spinner } from "@/components/ui/spinner"
import { Badge } from "@/components/ui/badge"
import type { ChatQueryResponse } from "@/lib/types/api-contract"

interface Message {
  role: "user" | "assistant"
  content: string
}

/* -------------------------------------------
 * Helper: parse repositoryId
 * Parsea formato: github:owner:repo
 * ------------------------------------------- */
function parseRepositoryId(repositoryId: string): { owner: string; repo: string } | null {
  if (!repositoryId || typeof repositoryId !== "string") {
    return null
  }
  
  const trimmed = repositoryId.trim()
  if (!trimmed) {
    return null
  }

  // Validar que no contenga "undefined" o "null"
  if (trimmed === "undefined" || trimmed.includes("undefined") || trimmed.includes("null")) {
    return null
  }
  
  // Formato: github:owner:repo
  if (trimmed.startsWith("github:")) {
    const parts = trimmed.replace("github:", "").split(":")
    if (parts.length === 2) {
      const owner = parts[0].trim()
      const repo = parts[1].trim()
      // Validar que owner y repo no sean "undefined" o "null"
      if (owner && repo && owner !== "undefined" && repo !== "undefined" && owner !== "null" && repo !== "null") {
        return { owner, repo }
      }
    }
  }
  
  return null
}

export function ChatInterface() {
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState("")
  const [loading, setLoading] = useState(false)
  const [llmDebug, setLlmDebug] = useState<{
    engine?: string
    model?: string
    location?: string
  } | null>(null)

  const { repositoryId, preferencesLoaded, status, error } = useRepository()
  const { setContextFiles } = useContextFiles()

  // Solo status === "completed" o "ready" (legacy) habilita el chat
  const canChat = status === "completed" || status === "ready"

  const messagesEndRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const abortControllerRef = useRef<AbortController | null>(null)

  /* -------------------------------------------
   * Auto scroll
   * ------------------------------------------- */
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages, loading])

  /* -------------------------------------------
   * Auto resize textarea
   * ------------------------------------------- */
  useEffect(() => {
    if (!textareaRef.current) return
    textareaRef.current.style.height = "auto"
    textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`
  }, [input])

  /* -------------------------------------------
   * Mensaje inicial: resumen del repositorio
   * ------------------------------------------- */
  useEffect(() => {
    // Esperar a que las preferencias se carguen antes de ejecutar
    if (!preferencesLoaded) {
      return
    }

    // Guard clauses: no ejecutar si repositoryId es inválido
    if (!repositoryId || typeof repositoryId !== "string") {
      return
    }

    // Validar que repositoryId no contenga "undefined" o "null"
    if (repositoryId === "undefined" || repositoryId.includes("undefined") || repositoryId.includes("null")) {
      console.warn(`[ChatInterface] repositoryId inválido: "${repositoryId}"`)
      return
    }

    const loadRepositorySummary = async () => {
      try {
        const parsed = parseRepositoryId(repositoryId)
        if (!parsed) {
          console.warn(`[ChatInterface] Formato inválido de repositoryId: "${repositoryId}"`)
          return
        }

        // Guard clause adicional antes de hacer fetch
        if (!repositoryId || repositoryId === "undefined" || repositoryId.includes("undefined") || repositoryId.includes("null")) {
          console.warn(`[ChatInterface] repositoryId inválido antes de fetch: "${repositoryId}"`)
          return
        }

        // Usar endpoint con query params: /api/repository/status?repositoryId=...
        const res = await fetch(
          `/api/repository/status?repositoryId=${encodeURIComponent(repositoryId)}`
        )

        if (!res.ok) return
        const data = await res.json()

        const lines: string[] = []

        lines.push(`Repositorio cargado: ${data.repositoryId}`)
        if (data.stats?.totalFiles)
          lines.push(`Archivos analizados: ${data.stats.totalFiles}`)
        if (data.stats?.totalSize)
          lines.push(`Tamaño total: ${(data.stats.totalSize / 1024).toFixed(2)} KB`)
        if (data.stats?.languages && data.stats.languages.length > 0)
          lines.push(`Lenguajes: ${data.stats.languages.join(", ")}`)

        lines.push("")
        lines.push(
          "Podés preguntarme cómo funciona el sistema, dónde está definido algo o qué hace un archivo o módulo."
        )

        setMessages([
          {
            role: "assistant",
            content: lines.join("\n"),
          },
        ])
      } catch {
        // silencioso
      }
    }

    loadRepositorySummary()
  }, [repositoryId, preferencesLoaded])

  /* -------------------------------------------
   * Cancelar request
   * ------------------------------------------- */
  const handleCancel = () => {
    abortControllerRef.current?.abort()
    abortControllerRef.current = null
    setLoading(false)

    setMessages((prev) => {
      const last = prev[prev.length - 1]
      if (last?.role === "assistant" && last.content === "Pensando...") {
        return prev.slice(0, -1)
      }
      return prev
    })
  }

  /* -------------------------------------------
   * Enviar pregunta
   * ------------------------------------------- */
  const handleSend = async () => {
    if (!input.trim() || loading || !canChat) return

    if (!repositoryId) {
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content:
            "No hay un repositorio seleccionado o indexado. Seleccioná uno primero.",
        },
      ])
      return
    }

    const question = input.trim()
    setInput("")
    setLoading(true)

    setMessages((prev) => [...prev, { role: "user", content: question }])
    setMessages((prev) => [
      ...prev,
      { role: "assistant", content: "Pensando..." },
    ])

    const controller = new AbortController()
    abortControllerRef.current = controller

    try {
      const res = await fetch("/api/chat/query", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          repositoryId,
          question,
        }),
      })

      if (controller.signal.aborted) return

      const data = (await res.json()) as ChatQueryResponse

      // Según contrato: 200 = success, 202 = indexing, 400 = not ready
      if (res.status === 202) {
        // Repositorio indexando
        const indexingData = data as Extract<ChatQueryResponse, { status: "indexing" }>
        setMessages((prev) => {
          const updated = [...prev]
          updated[updated.length - 1] = {
            role: "assistant",
            content: indexingData.message,
          }
          return updated
        })
        setContextFiles([])
        return
      }

      if (res.status === 400) {
        // Repositorio no listo
        const notReadyData = data as Extract<ChatQueryResponse, { status: "idle" | "error" }>
        setMessages((prev) => {
          const updated = [...prev]
          updated[updated.length - 1] = {
            role: "assistant",
            content: notReadyData.message,
          }
          return updated
        })
        setContextFiles([])
        return
      }

      if (!res.ok) {
        throw new Error("Error al consultar el repositorio")
      }

      // Response 200: success
      const successData = data as Extract<ChatQueryResponse, { response: string }>
      
      const contextFiles = successData.sources?.map((source) => ({
        name: source.path.split("/").pop() || source.path,
        path: source.path,
      })) ?? []

      setContextFiles(contextFiles)

      // Guardar información debug del motor LLM si existe
      if (successData.debug) {
        setLlmDebug({
          engine: successData.debug.engine,
          model: successData.debug.model,
          location: successData.debug.location,
        })
      } else {
        setLlmDebug(null)
      }

      setMessages((prev) => {
        const updated = [...prev]
        updated[updated.length - 1] = {
          role: "assistant",
          content: successData.response,
        }
        return updated
      })
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") return

      setContextFiles([])
      setMessages((prev) => {
        const updated = [...prev]
        updated[updated.length - 1] = {
          role: "assistant",
          content:
            err instanceof Error
              ? `Error: ${err.message}`
              : "Error desconocido",
        }
        return updated
      })
    } finally {
      setLoading(false)
      abortControllerRef.current = null
    }
  }

  /* -------------------------------------------
   * Keybindings
   * ------------------------------------------- */
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
      e.preventDefault()
      handleSend()
    }
  }

  return (
    <Card className="h-full flex flex-col gap-0">
      <div className="border-b px-3 py-2 flex justify-between items-center">
        <div className="flex items-center gap-2">
          <div>
            <h2 className="font-semibold">Chat del Repositorio</h2>
            <p className="text-xs text-muted-foreground">
              Modo lectura • Respuestas verificables
            </p>
          </div>
          {llmDebug && llmDebug.engine && llmDebug.model && llmDebug.location && (
            <Badge variant="outline" className="text-xs">
              🧠 {llmDebug.engine} · {llmDebug.model} · {llmDebug.location}
            </Badge>
          )}
        </div>
        <ContextPanel compact />
      </div>

      <ScrollArea className="flex-1 p-3">
        <div className="space-y-4">
          {messages.map((msg, i) => {
            const thinking =
              msg.role === "assistant" &&
              msg.content === "Pensando..." &&
              loading

            return (
              <div
                key={i}
                className={`flex gap-3 ${
                  msg.role === "user" ? "justify-end" : "justify-start"
                }`}
              >
                {msg.role === "assistant" && (
                  <Avatar className="h-8 w-8 bg-primary">
                    <AvatarFallback>
                      {thinking ? (
                        <Spinner className="h-4 w-4 text-primary-foreground" />
                      ) : (
                        <Bot className="h-4 w-4 text-primary-foreground" />
                      )}
                    </AvatarFallback>
                  </Avatar>
                )}

                <div className="max-w-[80%] rounded-lg px-4 py-2 bg-muted text-sm whitespace-pre-wrap">
                  {thinking ? (
                    <div className="flex gap-2 items-center">
                      <Spinner className="h-4 w-4" />
                      <span className="italic">Pensando...</span>
                    </div>
                  ) : (
                    msg.content
                  )}
                </div>

                {msg.role === "user" && (
                  <Avatar className="h-8 w-8 bg-secondary">
                    <AvatarFallback>
                      <User className="h-4 w-4" />
                    </AvatarFallback>
                  </Avatar>
                )}
              </div>
            )
          })}
          <div ref={messagesEndRef} />
        </div>
      </ScrollArea>

      <div className="border-t px-3 py-2">
        {!canChat && (
          <div className="mb-2 text-sm text-muted-foreground">
            {status === "indexing" && "Indexando repositorio…"}
            {status === "idle" && "Repositorio no indexado"}
            {status === "error" && (error || "Error en el repositorio")}
          </div>
        )}
        <form
          onSubmit={(e) => {
            e.preventDefault()
            handleSend()
          }}
          className="flex gap-2 items-end"
        >
          <Textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Pregunta sobre el repositorio…"
            disabled={loading || !canChat}
            rows={1}
            className="resize-none"
          />

          {loading ? (
            <Button
              type="button"
              size="icon"
              variant="destructive"
              onClick={handleCancel}
            >
              <X className="h-4 w-4" />
            </Button>
          ) : (
            <Button type="submit" size="icon" disabled={!input.trim() || !canChat}>
              <Send className="h-4 w-4" />
            </Button>
          )}
        </form>
      </div>
    </Card>
  )
}

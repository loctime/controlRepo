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

interface Message {
  role: "user" | "assistant"
  content: string
}

/* -------------------------------------------
 * Helper: parse repositoryId
 * ------------------------------------------- */
function parseRepositoryId(repositoryId: string) {
  const [fullRepo, branch = "main"] = repositoryId.split("#")
  const [owner, repo] = fullRepo.split("/")
  return { owner, repo, branch }
}

export function ChatInterface() {
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState("")
  const [loading, setLoading] = useState(false)

  const { repositoryId } = useRepository()
  const { setContextFiles } = useContextFiles()

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
    if (!repositoryId) return

    const loadRepositorySummary = async () => {
      try {
        const { owner, repo, branch } = parseRepositoryId(repositoryId)

        const res = await fetch(
          `/api/repository/status?owner=${owner}&repo=${repo}&branch=${branch}`
        )

        if (!res.ok) return
        const data = await res.json()

        const lines: string[] = []

        lines.push(`Repositorio cargado: ${data.repositoryId}`)
        if (data.commit) lines.push(`Commit indexado: ${data.commit}`)
        if (data.totalFiles)
          lines.push(`Archivos analizados: ${data.totalFiles}`)

        if (data.keyFiles?.readme) {
          lines.push("README detectado.")
        }

        if (data.keyFiles?.docs > 0) {
          lines.push(
            `Documentación encontrada (${data.keyFiles.docs} archivos).`
          )
        }

        if (data.keyFiles?.apiRoutes > 0) {
          lines.push(
            `Rutas API detectadas (${data.keyFiles.apiRoutes}).`
          )
        }

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
  }, [repositoryId])

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
    if (!input.trim() || loading) return

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
    console.log("repositoryId:", repositoryId)

    try {
      const res = await fetch("/api/chat/query", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          question,
          repositoryId,
        }),
      })

      if (controller.signal.aborted) return

      const data = await res.json()

      if (!res.ok || !data.success) {
        setContextFiles([])
        throw new Error(data.error || "Error al consultar el repositorio")
      }

      const contextFiles =
        data.sources?.files?.map((path: string) => ({
          name: path.split("/").pop(),
          path,
        })) ?? []

      setContextFiles(contextFiles)

      setMessages((prev) => {
        const updated = [...prev]
        updated[updated.length - 1] = {
          role: "assistant",
          content: data.answer,
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
        <div>
          <h2 className="font-semibold">Chat del Repositorio</h2>
          <p className="text-xs text-muted-foreground">
            Modo lectura • Respuestas verificables
          </p>
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
            disabled={loading}
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
            <Button type="submit" size="icon" disabled={!input.trim()}>
              <Send className="h-4 w-4" />
            </Button>
          )}
        </form>
      </div>
    </Card>
  )
}

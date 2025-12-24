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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Spinner } from "@/components/ui/spinner"
import type { AssistantRole } from "@/lib/prompts/system-prompts"

interface Message {
  role: "user" | "assistant"
  content: string
}

interface ConversationMemory {
  previousIntents: string[]
  usedSources: string[]
  findings: {
    improvements: string[]
    risks: string[]
  }
  previousRole?: AssistantRole
}

/**
 * Detecta la intención de una pregunta basándose en palabras clave
 */
function detectIntent(question: string): string {
  const lowerQuestion = question.toLowerCase()
  
  if (lowerQuestion.includes("dónde") || lowerQuestion.includes("ubicación") || lowerQuestion.includes("path")) {
    return "LOCALIZACIÓN"
  }
  if (lowerQuestion.includes("qué hace") || lowerQuestion.includes("qué es") || lowerQuestion.includes("para qué")) {
    return "FUNCIONALIDAD"
  }
  if (lowerQuestion.includes("cómo funciona") || lowerQuestion.includes("cómo se") || lowerQuestion.includes("flujo")) {
    return "PROCESO/FLUJO"
  }
  if (lowerQuestion.includes("arquitectura") || lowerQuestion.includes("estructura") || lowerQuestion.includes("overview") || lowerQuestion.includes("organización")) {
    return "VISTA MACRO"
  }
  if (lowerQuestion.includes("auditar") || lowerQuestion.includes("revisar") || lowerQuestion.includes("evaluar") || lowerQuestion.includes("buenas prácticas")) {
    return "AUDITORÍA"
  }
  if (lowerQuestion.includes("por qué") || lowerQuestion.includes("razón") || lowerQuestion.includes("motivo")) {
    return "JUSTIFICACIÓN"
  }
  if (lowerQuestion.includes("comparar") || lowerQuestion.includes("diferencias") || lowerQuestion.includes("similitudes") || lowerQuestion.includes(" vs ")) {
    return "COMPARACIÓN"
  }
  
  return "GENERAL"
}

export function ChatInterface() {
  const [messages, setMessages] = useState<Message[]>([
    {
      role: "assistant",
      content:
        "¡Hola! Soy tu asistente de documentación del repositorio. Puedes preguntarme sobre la arquitectura, módulos, o cualquier aspecto del proyecto.",
    },
  ])
  const [input, setInput] = useState("")
  const [loading, setLoading] = useState(false)
  const [selectedRole, setSelectedRole] = useState<AssistantRole>("architecture-explainer")
  const [conversationMemory, setConversationMemory] = useState<ConversationMemory>({
    previousIntents: [],
    usedSources: [],
    findings: {
      improvements: [],
      risks: [],
    },
  })
  const { repositoryId } = useRepository()
  const { setContextFiles } = useContextFiles()
  
  // Refs para auto-scroll y foco
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  
  // AbortController para cancelar requests
  const abortControllerRef = useRef<AbortController | null>(null)
  
  // Auto-scroll al último mensaje cuando cambian los mensajes
  useEffect(() => {
    if (messagesEndRef.current) {
      // Usar scrollIntoView que funciona bien con ScrollArea
      messagesEndRef.current.scrollIntoView({ behavior: "smooth", block: "end" })
    }
  }, [messages, loading])
  
  // Auto-resize del textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto"
      textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`
    }
  }, [input])
  
  // Mantener foco en textarea después de enviar
  useEffect(() => {
    if (!loading && textareaRef.current) {
      textareaRef.current.focus()
    }
  }, [loading])

  const handleCancel = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
      abortControllerRef.current = null
    }
    setLoading(false)
    // Remover el mensaje placeholder del asistente si existe
    setMessages((prev) => {
      const lastMessage = prev[prev.length - 1]
      if (lastMessage?.role === "assistant" && lastMessage.content === "Pensando...") {
        return prev.slice(0, -1)
      }
      return prev
    })
  }

  const handleSend = async () => {
    if (!input.trim() || loading) return

    const userMessage = input.trim()
    const intent = detectIntent(userMessage)
    
    setMessages((prev) => [...prev, { role: "user", content: userMessage }])
    setInput("")
    setLoading(true)
    
    // Agregar mensaje placeholder del asistente mientras piensa
    setMessages((prev) => [...prev, { role: "assistant", content: "Pensando..." }])

    // Crear nuevo AbortController para este request
    const abortController = new AbortController()
    abortControllerRef.current = abortController

    try {
      // Verificar que hay un repositorio indexado
      if (!repositoryId) {
        setMessages((prev) => {
          const updated = [...prev]
          // Reemplazar el mensaje "Pensando..." con el error
          updated[updated.length - 1] = {
            role: "assistant",
            content: "No hay un repositorio indexado. Por favor, indexa un repositorio primero.",
          }
          return updated
        })
        setLoading(false)
        abortControllerRef.current = null
        return
      }

      // Consultar el endpoint de chat con Ollama (incluyendo memoria de conversación y rol)
      // La memoria ya contiene el previousRole de la pregunta anterior (si existe)
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          question: userMessage,
          repositoryId,
          role: selectedRole,
          conversationMemory: conversationMemory,
        }),
        signal: abortController.signal,
      })

      // Verificar si fue cancelado
      if (abortController.signal.aborted) {
        return
      }

      const data = await response.json()

      if (!response.ok) {
        // Error de la API - limpiar archivos de contexto
        setContextFiles([])
        setMessages((prev) => {
          const updated = [...prev]
          // Reemplazar el mensaje "Pensando..." con el error
          updated[updated.length - 1] = {
            role: "assistant",
            content: `Error: ${data.error || data.details || "Error desconocido al generar la respuesta."}`,
          }
          return updated
        })
      } else {
        // Respuesta exitosa con respuesta generada por Ollama
        // Guardar archivos declarados explícitamente en la respuesta
        const declaredFiles = data.files && Array.isArray(data.files) && data.files.length > 0
          ? data.files.map((file: { name: string; path: string }) => ({
              name: file.name,
              path: file.path,
            }))
          : []
        
        setContextFiles(declaredFiles)
        
        // Actualizar memoria de conversación (incluyendo el rol actual como previousRole para la próxima pregunta)
        setConversationMemory((prev) => {
          const newMemory: ConversationMemory = {
            previousIntents: [...prev.previousIntents, intent].slice(-10), // Mantener últimas 10 intenciones
            usedSources: [
              ...prev.usedSources,
              ...declaredFiles.map((f: { path: string }) => f.path),
            ]
              .filter((path, index, self) => self.indexOf(path) === index) // Eliminar duplicados
              .slice(-20), // Mantener últimas 20 fuentes
            findings: {
              improvements: [
                ...prev.findings.improvements,
                ...(data.findings?.improvements || []),
              ]
                .filter((item, index, self) => self.indexOf(item) === index) // Eliminar duplicados
                .slice(-10), // Mantener últimas 10 mejoras
              risks: [
                ...prev.findings.risks,
                ...(data.findings?.risks || []),
              ]
                .filter((item, index, self) => self.indexOf(item) === index) // Eliminar duplicados
                .slice(-10), // Mantener últimos 10 riesgos
            },
            previousRole: selectedRole, // Guardar el rol actual para detectar cambios en la próxima pregunta
          }
          return newMemory
        })
        
        // Reemplazar el mensaje "Pensando..." con la respuesta real
        setMessages((prev) => {
          const updated = [...prev]
          updated[updated.length - 1] = {
            role: "assistant",
            content: data.answer || "No se pudo generar una respuesta.",
          }
          return updated
        })
      }
    } catch (error) {
      // Verificar si fue cancelado
      if (error instanceof Error && error.name === "AbortError") {
        // Request cancelado - no hacer nada, ya se limpió el estado
        return
      }
      
      // Error de red u otro error - limpiar archivos de contexto
      setContextFiles([])
      setMessages((prev) => {
        const updated = [...prev]
        // Reemplazar el mensaje "Pensando..." con el error
        updated[updated.length - 1] = {
          role: "assistant",
          content: `Error: ${error instanceof Error ? error.message : "Error desconocido al consultar el repositorio."}`,
        }
        return updated
      })
    } finally {
      setLoading(false)
      abortControllerRef.current = null
    }
  }
  
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // Ctrl+Enter o Cmd+Enter = enviar
    if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
      e.preventDefault()
      handleSend()
    }
    // Enter solo = nueva línea (comportamiento por defecto del textarea)
  }

  return (
    <Card className="h-full flex flex-col border-border py-0 gap-0">
      <div className="border-b border-border px-3 py-2">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            <h2 className="font-semibold text-foreground">Chat del Repositorio</h2>
            <p className="text-xs text-muted-foreground mt-1">Modo solo lectura - Consulta sobre el proyecto</p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Select value={selectedRole} onValueChange={(value) => setSelectedRole(value as AssistantRole)}>
              <SelectTrigger className="w-[180px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="architecture-explainer">Arquitectura</SelectItem>
                <SelectItem value="structure-auditor">Auditoría</SelectItem>
              </SelectContent>
            </Select>
            <ContextPanel compact />
          </div>
        </div>
      </div>

      <ScrollArea className="flex-1 p-3">
        <div className="space-y-4">
          {messages.map((message, index) => {
            const isThinking = message.role === "assistant" && message.content === "Pensando..." && loading
            const isError = message.role === "assistant" && message.content.startsWith("Error:")
            
            return (
              <div key={index} className={`flex gap-3 ${message.role === "user" ? "justify-end" : "justify-start"}`}>
                {message.role === "assistant" && (
                  <Avatar className="h-8 w-8 bg-primary shrink-0">
                    <AvatarFallback>
                      {isThinking ? (
                        <Spinner className="h-4 w-4 text-primary-foreground" />
                      ) : (
                        <Bot className="h-4 w-4 text-primary-foreground" />
                      )}
                    </AvatarFallback>
                  </Avatar>
                )}
                <div
                  className={`rounded-lg px-4 py-2 max-w-[80%] ${
                    message.role === "user"
                      ? "bg-primary text-primary-foreground"
                      : isError
                      ? "bg-destructive/10 text-destructive border border-destructive/20"
                      : isThinking
                      ? "bg-muted/50 text-muted-foreground border border-muted"
                      : "bg-muted text-muted-foreground"
                  }`}
                >
                  {isThinking ? (
                    <div className="flex items-center gap-2">
                      <Spinner className="h-4 w-4" />
                      <p className="text-sm leading-relaxed italic">Pensando...</p>
                    </div>
                  ) : (
                    <p className="text-sm leading-relaxed whitespace-pre-wrap">{message.content}</p>
                  )}
                </div>
                {message.role === "user" && (
                  <Avatar className="h-8 w-8 bg-secondary shrink-0">
                    <AvatarFallback>
                      <User className="h-4 w-4 text-secondary-foreground" />
                    </AvatarFallback>
                  </Avatar>
                )}
              </div>
            )
          })}
          <div ref={messagesEndRef} />
        </div>
      </ScrollArea>

      <div className="border-t border-border px-3 py-2">
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
            placeholder="Pregunta sobre el repositorio... (Ctrl+Enter para enviar)"
            className="flex-1 min-h-[40px] max-h-[200px] resize-none"
            rows={1}
            disabled={loading}
          />
          {loading ? (
            <Button
              type="button"
              size="icon"
              variant="destructive"
              onClick={handleCancel}
              title="Cancelar generación"
            >
              <X className="h-4 w-4" />
              <span className="sr-only">Cancelar generación</span>
            </Button>
          ) : (
            <Button
              type="submit"
              size="icon"
              disabled={!input.trim()}
              title="Enviar mensaje (Ctrl+Enter)"
            >
              <Send className="h-4 w-4" />
              <span className="sr-only">Enviar mensaje</span>
            </Button>
          )}
        </form>
        <div className="text-xs text-muted-foreground mt-1 px-1">
          <kbd className="px-1.5 py-0.5 text-xs font-semibold text-muted-foreground bg-muted border border-border rounded">
            Enter
          </kbd>{" "}
          nueva línea •{" "}
          <kbd className="px-1.5 py-0.5 text-xs font-semibold text-muted-foreground bg-muted border border-border rounded">
            Ctrl+Enter
          </kbd>{" "}
          enviar
        </div>
      </div>
    </Card>
  )
}

"use client"

import { useState } from "react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Send, Bot, User } from "lucide-react"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { ContextPanel } from "./context-panel"
import { useRepository } from "@/lib/repository-context"
import { useContextFiles } from "@/lib/context-files-context"

interface Message {
  role: "user" | "assistant"
  content: string
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
  const { repositoryId } = useRepository()
  const { setContextFiles } = useContextFiles()

  const handleSend = async () => {
    if (!input.trim()) return

    const userMessage = input.trim()
    setMessages([...messages, { role: "user", content: userMessage }])
    setInput("")
    setLoading(true)

    try {
      // Verificar que hay un repositorio indexado
      if (!repositoryId) {
        setMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            content: "No hay un repositorio indexado. Por favor, indexa un repositorio primero.",
          },
        ])
        setLoading(false)
        return
      }

      // Consultar el endpoint de chat con Ollama
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          question: userMessage,
          repositoryId,
        }),
      })

      const data = await response.json()

      if (!response.ok) {
        // Error de la API - limpiar archivos de contexto
        setContextFiles([])
        setMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            content: `Error: ${data.error || data.details || "Error desconocido al generar la respuesta."}`,
          },
        ])
      } else {
        // Respuesta exitosa con respuesta generada por Ollama
        const fileCount = data.files?.length || 0
        
        // Guardar archivos en el contexto compartido
        if (data.files && Array.isArray(data.files)) {
          setContextFiles(data.files.map((file: { name: string; path: string }) => ({
            name: file.name,
            path: file.path,
          })))
        } else {
          setContextFiles([])
        }
        
        // Mostrar la respuesta generada por el modelo
        setMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            content: data.answer || "No se pudo generar una respuesta.",
          },
        ])
      }
    } catch (error) {
      // Error de red u otro error - limpiar archivos de contexto
      setContextFiles([])
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: `Error: ${error instanceof Error ? error.message : "Error desconocido al consultar el repositorio."}`,
        },
      ])
    } finally {
      setLoading(false)
    }
  }

  return (
    <Card className="h-full flex flex-col border-border py-0 gap-0">
      <div className="border-b border-border px-3 py-2">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            <h2 className="font-semibold text-foreground">Chat del Repositorio</h2>
            <p className="text-xs text-muted-foreground mt-1">Modo solo lectura - Consulta sobre el proyecto</p>
          </div>
          <div className="shrink-0">
            <ContextPanel compact />
          </div>
        </div>
      </div>

      <ScrollArea className="flex-1 p-3">
        <div className="space-y-4">
          {messages.map((message, index) => (
            <div key={index} className={`flex gap-3 ${message.role === "user" ? "justify-end" : "justify-start"}`}>
              {message.role === "assistant" && (
                <Avatar className="h-8 w-8 bg-primary">
                  <AvatarFallback>
                    <Bot className="h-4 w-4 text-primary-foreground" />
                  </AvatarFallback>
                </Avatar>
              )}
              <div
                className={`rounded-lg px-4 py-2 max-w-[80%] ${
                  message.role === "user" ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
                }`}
              >
                <p className="text-sm leading-relaxed">{message.content}</p>
              </div>
              {message.role === "user" && (
                <Avatar className="h-8 w-8 bg-secondary">
                  <AvatarFallback>
                    <User className="h-4 w-4 text-secondary-foreground" />
                  </AvatarFallback>
                </Avatar>
              )}
            </div>
          ))}
        </div>
      </ScrollArea>

      <div className="border-t border-border px-3 py-2">
        <form
          onSubmit={(e) => {
            e.preventDefault()
            handleSend()
          }}
          className="flex gap-2"
        >
          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Pregunta sobre el repositorio..."
            className="flex-1"
          />
          <Button type="submit" size="icon" disabled={loading}>
            <Send className="h-4 w-4" />
            <span className="sr-only">Enviar mensaje</span>
          </Button>
        </form>
      </div>
    </Card>
  )
}

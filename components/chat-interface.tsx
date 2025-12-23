"use client"

import { useState } from "react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Send, Bot, User } from "lucide-react"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"

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

  const handleSend = () => {
    if (!input.trim()) return

    setMessages([...messages, { role: "user", content: input }])

    // Simular respuesta del asistente
    setTimeout(() => {
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content:
            "Esta es una respuesta de ejemplo. En una implementación real, aquí se mostraría la información del repositorio basada en tu pregunta.",
        },
      ])
    }, 500)

    setInput("")
  }

  return (
    <Card className="h-full flex flex-col border-border py-0 gap-0">
      <div className="border-b border-border px-3 py-2">
        <div>
          <h2 className="font-semibold text-foreground">Chat del Repositorio</h2>
          <p className="text-xs text-muted-foreground mt-1">Modo solo lectura - Consulta sobre el proyecto</p>
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
          <Button type="submit" size="icon">
            <Send className="h-4 w-4" />
            <span className="sr-only">Enviar mensaje</span>
          </Button>
        </form>
      </div>
    </Card>
  )
}

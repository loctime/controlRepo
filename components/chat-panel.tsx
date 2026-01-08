"use client"

import React, { useState } from "react"
import { ChatInterface } from "./chat-interface"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { useRepository } from "@/lib/repository-context"
import { Spinner } from "@/components/ui/spinner"

export function ChatPanel() {
  const { repositoryId } = useRepository()

  const [chatStarted, setChatStarted] = useState(false)
  const [generatingFlows, setGeneratingFlows] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  const canUseRepo = Boolean(repositoryId)

  const handleGenerateFlows = async () => {
    if (!repositoryId) return

    setGeneratingFlows(true)
    setMessage(null)

    try {
      // Parsear repositoryId en formato: github:owner:repo
      if (!repositoryId.startsWith("github:")) {
        throw new Error("Formato de repositoryId inválido")
      }

      const parts = repositoryId.replace("github:", "").split(":")
      if (parts.length !== 2) {
        throw new Error("Formato de repositoryId inválido")
      }

      const [owner, repo] = parts

      const res = await fetch("/api/repository/flows/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ owner, repo }),
      })

      const data = await res.json()

      if (!res.ok) {
        throw new Error(data.error || "Error al generar flows")
      }

      setMessage(
        data.flows?.hasFlows
          ? "Flows generados correctamente."
          : "No se detectaron flujos explícitos en el repositorio."
      )
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Error desconocido")
    } finally {
      setGeneratingFlows(false)
    }
  }

  // 👉 Antes de iniciar el chat
  if (!chatStarted) {
    return (
      <main className="h-full flex items-center justify-center p-6">
        <Card className="w-full max-w-xl p-6 space-y-4">
          <h2 className="text-lg font-semibold">Chat del repositorio</h2>

          {!canUseRepo && (
            <p className="text-sm text-muted-foreground">
              Seleccioná un repositorio para habilitar el chat.
            </p>
          )}

          {canUseRepo && (
            <>
              <p className="text-sm text-muted-foreground">
                Repositorio seleccionado: <strong>{repositoryId}</strong>
              </p>

              <div className="flex gap-2">
                <Button onClick={() => setChatStarted(true)}>
                  Iniciar chat
                </Button>

                <Button
                  variant="secondary"
                  onClick={handleGenerateFlows}
                  disabled={generatingFlows}
                >
                  {generatingFlows ? (
                    <>
                      <Spinner className="h-4 w-4 mr-2" />
                      Generando…
                    </>
                  ) : (
                    "Generar flows"
                  )}
                </Button>
              </div>
            </>
          )}

          {message && (
            <p className="text-sm text-muted-foreground border-t pt-3">
              {message}
            </p>
          )}
        </Card>
      </main>
    )
  }

  // 👉 Chat iniciado
  return (
    <main className="h-full">
      <ChatInterface />
    </main>
  )
}

export default ChatPanel

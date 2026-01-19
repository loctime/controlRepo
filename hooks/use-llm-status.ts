"use client"

import { useState, useEffect, useRef } from "react"
import type { LLMStatusResponse } from "@/lib/types/api-contract"

interface LLMStatusState {
  status: "loading" | "connected" | "disconnected" | "unknown"
  provider?: string
  model?: string
  error?: string
}

/**
 * Hook para obtener el estado de conexión del LLM
 * Consulta periódicamente el endpoint /api/chat/status
 */
export function useLLMStatus(intervalMs: number = 10000) {
  const [state, setState] = useState<LLMStatusState>({ status: "loading" })
  const intervalRef = useRef<NodeJS.Timeout | null>(null)
  const mountedRef = useRef(true)

  const fetchStatus = async () => {
    try {
      // Crear AbortController para timeout manual (compatible con navegadores más antiguos)
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 3000)

      const res = await fetch("/api/chat/status", {
        method: "GET",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
      })

      clearTimeout(timeoutId)

      if (!res.ok) {
        setState({
          status: "disconnected",
          error: `Error ${res.status}`,
        })
        return
      }

      const data = (await res.json()) as LLMStatusResponse

      if (!mountedRef.current) return

      if (data.ok && data.provider === "ollama") {
        setState({
          status: "connected",
          provider: data.provider,
          model: data.model,
        })
      } else if (data.ok === false) {
        setState({
          status: "disconnected",
          error: data.error,
        })
      } else {
        // Estado desconocido (ok === true pero provider !== "ollama" o sin provider)
        setState({
          status: "unknown",
          provider: data.provider,
          model: data.model,
        })
      }
    } catch (err) {
      if (!mountedRef.current) return

      if (err instanceof Error && err.name === "AbortError") {
        // Timeout
        setState({
          status: "unknown",
          error: "Timeout",
        })
      } else {
        setState({
          status: "disconnected",
          error: err instanceof Error ? err.message : "Error desconocido",
        })
      }
    }
  }

  useEffect(() => {
    mountedRef.current = true

    // Primera consulta inmediata
    fetchStatus()

    // Configurar polling periódico
    intervalRef.current = setInterval(() => {
      if (mountedRef.current) {
        fetchStatus()
      }
    }, intervalMs)

    return () => {
      mountedRef.current = false
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
      }
    }
  }, [intervalMs])

  return state
}

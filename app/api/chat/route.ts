import { NextRequest, NextResponse } from "next/server"
import { getRepositoryIndex } from "@/lib/repository/storage-filesystem"
import { searchFiles } from "@/lib/repository/search"
import { IndexedFile } from "@/lib/types/repository"
import { getSystemPrompt, DEFAULT_ROLE, type AssistantRole } from "@/lib/prompts/system-prompts"

/**
 * POST /api/chat
 * Genera una respuesta usando Ollama (phi-3) basada en archivos relevantes del repositorio
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { question, repositoryId, role } = body
    
    // Determinar el rol del asistente (por defecto: architecture-explainer)
    // TODO: Hacer configurable desde UI en el futuro
    const assistantRole: AssistantRole = role && (role === "architecture-explainer" || role === "structure-auditor")
      ? role
      : DEFAULT_ROLE

    // Validar inputs
    if (!question || typeof question !== "string" || !question.trim()) {
      return NextResponse.json(
        { error: "question es requerida y no puede estar vacía" },
        { status: 400 }
      )
    }

    if (!repositoryId || typeof repositoryId !== "string") {
      return NextResponse.json(
        { error: "repositoryId es requerido" },
        { status: 400 }
      )
    }

    // Obtener índice del repositorio
    const index = await getRepositoryIndex(repositoryId)

    if (!index) {
      return NextResponse.json(
        {
          error: `El repositorio ${repositoryId} no está indexado. Por favor, indexa el repositorio primero.`,
        },
        { status: 409 }
      )
    }

    if (index.status !== "completed") {
      return NextResponse.json(
        {
          error: `El repositorio ${repositoryId} está siendo indexado (status: ${index.status}). Por favor, espera a que termine la indexación.`,
        },
        { status: 409 }
      )
    }

    // Buscar archivos relevantes usando searchFiles
    const query = question.trim()
    const relevantFiles = searchFiles(index.files, query)

    // Construir contexto de texto con metadata de los archivos
    const contextParts: string[] = []

    if (relevantFiles.length === 0) {
      // Si no hay archivos relevantes, responder directamente sin llamar a Ollama
      return NextResponse.json({
        answer: "No se encontró información relevante en el repositorio para responder tu pregunta. Intenta reformular tu consulta o verifica que el repositorio esté correctamente indexado.",
        files: [],
        debug: {
          model: "phi3:mini",
          contextFiles: 0,
        },
      })
    }

    // Construir contexto con metadata de cada archivo relevante
    relevantFiles.forEach((file: IndexedFile, index: number) => {
      const fileContext: string[] = []
      
      fileContext.push(`Archivo ${index + 1}: ${file.name}`)
      fileContext.push(`Ruta: ${file.path}`)
      
      if (file.summary.description) {
        fileContext.push(`Descripción: ${file.summary.description}`)
      }
      
      if (file.summary.exports && file.summary.exports.length > 0) {
        fileContext.push(`Exports: ${file.summary.exports.join(", ")}`)
      }
      
      if (file.summary.functions && file.summary.functions.length > 0) {
        fileContext.push(`Funciones: ${file.summary.functions.join(", ")}`)
      }
      
      if (file.summary.hooks && file.summary.hooks.length > 0) {
        fileContext.push(`Hooks: ${file.summary.hooks.join(", ")}`)
      }
      
      if (file.summary.props && file.summary.props.length > 0) {
        fileContext.push(`Props: ${file.summary.props.join(", ")}`)
      }
      
      if (file.tags && file.tags.length > 0) {
        fileContext.push(`Tags: ${file.tags.join(", ")}`)
      }
      
      if (file.category) {
        fileContext.push(`Categoría: ${file.category}`)
      }
      
      contextParts.push(fileContext.join("\n"))
    })

    const contextText = contextParts.join("\n\n---\n\n")

    // Construir prompt usando el sistema de roles
    const prompt = getSystemPrompt(assistantRole, contextText, query)

    // Llamar a Ollama local
    let ollamaResponse
    try {
      const ollamaRequest = await fetch("http://localhost:11434/api/generate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "phi3:mini",
          prompt: prompt,
          stream: false,
        }),
      })

      if (!ollamaRequest.ok) {
        throw new Error(`Error de Ollama: ${ollamaRequest.statusText}`)
      }

      ollamaResponse = await ollamaRequest.json()
    } catch (error) {
      // Si Ollama no está disponible, devolver respuesta de fallback
      console.error("Error al llamar a Ollama:", error)
      return NextResponse.json(
        {
          error: "Ollama no está disponible. Asegúrate de que Ollama esté ejecutándose en http://localhost:11434 y que el modelo 'phi3' esté instalado.",
          details: error instanceof Error ? error.message : "Error desconocido",
        },
        { status: 503 }
      )
    }

    // Extraer respuesta del modelo
    const answer = ollamaResponse.response || ollamaResponse.text || "No se pudo generar una respuesta."

    // Formatear archivos para la respuesta
    const files = relevantFiles.map((file: IndexedFile) => ({
      path: file.path,
      name: file.name,
    }))

    return NextResponse.json({
      answer: answer.trim(),
      files,
      debug: {
        model: "phi3:mini",
        contextFiles: relevantFiles.length,
        role: assistantRole,
      },
    })
  } catch (error) {
    console.error("Error en POST /api/chat:", error)
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Error desconocido",
      },
      { status: 500 }
    )
  }
}


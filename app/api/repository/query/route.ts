import { NextRequest, NextResponse } from "next/server"
import { getRepositoryIndex } from "@/lib/repository/storage-filesystem"
import { searchFiles } from "@/lib/repository/search"

/**
 * POST /api/repository/query
 * Consulta el repositorio indexado buscando archivos relevantes
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { question, repositoryId } = body

    // Validar que question no esté vacía
    if (!question || typeof question !== "string" || !question.trim()) {
      return NextResponse.json(
        { error: "question es requerida y no puede estar vacía" },
        { status: 400 }
      )
    }

    // Si no se proporciona repositoryId, intentar obtenerlo del contexto o usar el primero disponible
    // Por ahora, requerimos repositoryId explícito
    if (!repositoryId || typeof repositoryId !== "string") {
      return NextResponse.json(
        { error: "repositoryId es requerido" },
        { status: 400 }
      )
    }

    // Obtener índice del repositorio
    const index = await getRepositoryIndex(repositoryId)

    // Verificar si el repositorio está indexado
    if (!index) {
      return NextResponse.json(
        {
          error: `El repositorio ${repositoryId} no está indexado. Por favor, indexa el repositorio primero.`,
        },
        { status: 409 }
      )
    }

    // Verificar si el índice está completo
    if (index.status !== "completed") {
      return NextResponse.json(
        {
          error: `El repositorio ${repositoryId} está siendo indexado (status: ${index.status}). Por favor, espera a que termine la indexación.`,
        },
        { status: 409 }
      )
    }

    // Buscar archivos relevantes usando la función real del contexto
    const query = question.trim()
    const relevantFiles = searchFiles(index.files, query)

    // Formatear respuesta
    const files = relevantFiles.map((file) => ({
      path: file.path,
      name: file.name,
    }))

    return NextResponse.json({
      question: question.trim(),
      files,
      debug: {
        totalResults: files.length,
      },
    })
  } catch (error) {
    console.error("Error en POST /api/repository/query:", error)
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Error desconocido",
      },
      { status: 500 }
    )
  }
}


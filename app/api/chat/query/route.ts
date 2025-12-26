import { NextRequest, NextResponse } from "next/server"

import { analyzeQuestion } from "@/lib/chat/step1-question-analysis"
import { selectJsonSources } from "@/lib/chat/step2-select-json-sources"
import { loadAndFilterJsonSources } from "@/lib/chat/step3-load-and-filter-json"
import { loadRepoFiles } from "@/lib/chat/step4-select-and-load-repo-files"
import { generateAnswer } from "@/lib/chat/step5-generate-answer"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/* -------------------------------------------
 * POST /api/chat/query
 * ------------------------------------------- */

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()

    const {
      question,
      repositoryId,
      repositoryPath, // path local al repo clonado
    } = body

    /* ---------------------------
     * Validaciones mínimas
     * --------------------------- */

    if (!question || typeof question !== "string") {
      return NextResponse.json(
        { error: "question es requerido" },
        { status: 400 }
      )
    }

    if (!repositoryId || typeof repositoryId !== "string") {
      return NextResponse.json(
        { error: "repositoryId es requerido" },
        { status: 400 }
      )
    }

    if (!repositoryPath || typeof repositoryPath !== "string") {
      return NextResponse.json(
        { error: "repositoryPath es requerido" },
        { status: 400 }
      )
    }

    /* ---------------------------
     * PASO 1 – Análisis de pregunta
     * --------------------------- */

    const analysis = analyzeQuestion(question)

    /* ---------------------------
     * PASO 2 – Selección de JSON
     * --------------------------- */

    const jsonSelection = selectJsonSources(analysis.signals)

    /* ---------------------------
     * PASO 3 – Cargar JSON
     * --------------------------- */

    const jsonContext = await loadAndFilterJsonSources(
      repositoryId,
      jsonSelection.selected,
      analysis
    )

    /* ---------------------------
     * PASO 4 – Cargar archivos del repo (si hace falta)
     * --------------------------- */

    let repoFiles

    if (!jsonContext.sufficient) {
      repoFiles = await loadRepoFiles(
        repositoryPath,
        analysis,
        jsonContext,
        { maxFiles: 5 }
      )
    }

    /* ---------------------------
     * PASO 5 – Generar respuesta
     * --------------------------- */

    const answer = await generateAnswer(
      analysis,
      jsonContext,
      repoFiles
    )

    /* ---------------------------
     * Respuesta final
     * --------------------------- */

    return NextResponse.json({
      success: true,
      question: analysis.originalQuestion,
      normalizedQuestion: analysis.normalizedQuestion,
      answer: answer.answer,
      confidence: answer.confidence,
      sources: answer.sources,
      notes: answer.notes,
    })
  } catch (error) {
    console.error("Error en /api/chat/query:", error)

    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Error desconocido",
      },
      { status: 500 }
    )
  }
}

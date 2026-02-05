/**
 * POST /api/repository/flows/generate
 * Genera flows.json para un repositorio bajo demanda
 * 
 * GET /api/repository/flows/generate
 * Obtiene flows.json de un repositorio
 */

import { NextRequest, NextResponse } from "next/server"
import { getRepositoryIndex } from "@/lib/repository/storage"
import { generateFlows } from "@/lib/repository/flows/generator"
import { saveFlows, getFlows } from "@/lib/repository/flows/storage-filesystem"
import { createRepositoryId } from "@/lib/repository/utils"
import { resolveRepositoryBranch } from "@/lib/github/client"

/**
 * POST /api/repository/flows/generate
 * Genera flows.json para un repositorio bajo demanda
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { owner, repo, branch } = body

    // Validar parámetros
    if (!owner || !repo) {
      return NextResponse.json(
        { error: "owner y repo son requeridos" },
        { status: 400 }
      )
    }

    // Resolver rama
    let resolvedBranch: { branch: string; lastCommit: string }
    try {
      resolvedBranch = await resolveRepositoryBranch(owner, repo, branch)
    } catch (error) {
      return NextResponse.json(
        { error: `Error al resolver rama: ${error instanceof Error ? error.message : "Error desconocido"}` },
        { status: 400 }
      )
    }

    const actualBranch = resolvedBranch.branch
    const repositoryId = createRepositoryId(owner, repo, actualBranch)

    // Obtener índice del repositorio (debe estar indexado)
    const index = await getRepositoryIndex(repositoryId)

    if (!index) {
      return NextResponse.json(
        { error: `El repositorio ${repositoryId} no está indexado. Por favor, indexa el repositorio primero.` },
        { status: 404 }
      )
    }

    if (index.status !== "completed") {
      return NextResponse.json(
        { error: `El repositorio ${repositoryId} está siendo indexado (status: ${index.status}). Por favor, espera a que termine la indexación.` },
        { status: 409 }
      )
    }

    // Generar flows
    try {
      const flows = await generateFlows(index, owner, repo, actualBranch)
      
      // Guardar flows
      await saveFlows(repositoryId, flows)

      return NextResponse.json({
        success: true,
        repositoryId,
        flows: {
          totalFlows: flows.flows.length,
          generatedAt: flows.generatedAt,
          hasFlows: flows.flows.length > 0,
        },
        message: flows.flows.length > 0 
          ? "Flows generados exitosamente" 
          : "Análisis completado. No se detectaron flujos explícitos.",
      })
    } catch (error) {
      console.error(`Error al generar flows para ${repositoryId}:`, error)
      return NextResponse.json(
        {
          error: error instanceof Error ? error.message : "Error desconocido al generar flows",
        },
        { status: 500 }
      )
    }
  } catch (error) {
    console.error("Error en POST /api/repository/flows/generate:", error)
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Error desconocido",
      },
      { status: 500 }
    )
  }
}

/**
 * GET /api/repository/flows/generate
 * Obtiene flows.json de un repositorio
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const owner = searchParams.get("owner")
    const repo = searchParams.get("repo")
    const branch = searchParams.get("branch")

    // Validar parámetros
    if (!owner || !repo) {
      return NextResponse.json(
        { error: "owner y repo son requeridos" },
        { status: 400 }
      )
    }

    // Resolver rama
    let resolvedBranch: { branch: string; lastCommit: string }
    try {
      resolvedBranch = await resolveRepositoryBranch(owner, repo, branch || undefined)
    } catch (error) {
      return NextResponse.json(
        { error: `Error al resolver rama: ${error instanceof Error ? error.message : "Error desconocido"}` },
        { status: 400 }
      )
    }

    const actualBranch = resolvedBranch.branch
    const repositoryId = createRepositoryId(owner, repo, actualBranch)

    // Obtener flows
    const flows = await getFlows(repositoryId)

    if (!flows) {
      return NextResponse.json(
        { error: `No existen flows generados para ${repositoryId}. Usa POST para generarlos.` },
        { status: 404 }
      )
    }

    return NextResponse.json(flows)
  } catch (error) {
    console.error("Error en GET /api/repository/flows/generate:", error)
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Error desconocido",
      },
      { status: 500 }
    )
  }
}

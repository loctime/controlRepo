import { NextRequest, NextResponse } from "next/server"
import { getAllBranches } from "@/lib/github/client"

/**
 * GET /api/repository/branches
 * Obtiene todas las ramas disponibles de un repositorio
 */
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams
    const owner = searchParams.get("owner")
    const repo = searchParams.get("repo")

    // Validar parámetros
    if (!owner || !repo) {
      return NextResponse.json(
        { error: "owner y repo son requeridos" },
        { status: 400 }
      )
    }

    // Validar GITHUB_TOKEN
    if (!process.env.GITHUB_TOKEN) {
      return NextResponse.json(
        { error: "GITHUB_TOKEN no configurado" },
        { status: 401 }
      )
    }

    // Obtener todas las ramas
    const branches = await getAllBranches(owner, repo)

    // Retornar solo los nombres de las ramas
    const branchNames = branches.map((branch) => branch.name)

    return NextResponse.json({ branches: branchNames })
  } catch (error) {
    console.error("Error al obtener ramas:", error)
    const errorMessage = error instanceof Error ? error.message : "Error desconocido"
    return NextResponse.json(
      { error: errorMessage },
      { status: 500 }
    )
  }
}


import { NextRequest, NextResponse } from "next/server"
import { getAllBranches } from "@/lib/github/client"
import { getAuthenticatedUserId, getGitHubAccessToken } from "@/lib/auth/server-auth"

/**
 * GET /api/repository/branches
 * Obtiene todas las ramas disponibles de un repositorio
 */
export async function GET(request: NextRequest) {
  try {
    // Autenticación: Verificar token Firebase y obtener UID
    let uid: string
    try {
      uid = await getAuthenticatedUserId(request)
    } catch (error) {
      console.error("[BRANCHES] Error de autenticación:", error)
      return NextResponse.json(
        { error: error instanceof Error ? error.message : "No autorizado" },
        { status: 401 }
      )
    }

    // Obtener access_token de GitHub del usuario desde Firestore
    const accessToken = await getGitHubAccessToken(uid)
    if (!accessToken) {
      return NextResponse.json(
        { error: "GitHub no conectado. Por favor, conecta tu cuenta de GitHub primero." },
        { status: 400 }
      )
    }

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

    // Obtener todas las ramas
    const branches = await getAllBranches(owner, repo, accessToken)

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


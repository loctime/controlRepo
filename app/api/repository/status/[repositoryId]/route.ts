import { NextRequest, NextResponse } from "next/server"
import { getRepositoryIndex } from "@/lib/repository/storage-filesystem"
import { normalizeRepositoryIdForFile } from "@/lib/repository/utils"
import { readdir } from "fs/promises"
import { join } from "path"

/**
 * Parsea repositoryId en formato github:owner:repo y retorna owner y repo
 */
function parseRepositoryId(repositoryId: string): { owner: string; repo: string } | null {
  if (!repositoryId || !repositoryId.startsWith("github:")) {
    return null
  }
  
  const parts = repositoryId.replace("github:", "").split(":")
  if (parts.length !== 2) {
    return null
  }
  
  const [owner, repo] = parts
  if (!owner || !repo) {
    return null
  }
  
  return { owner, repo }
}

/**
 * Busca un índice en el filesystem local
 * Intenta primero con branches comunes, luego busca archivos que coincidan con el patrón
 */
async function findIndexInFilesystem(owner: string, repo: string): Promise<{ index: any; branch: string } | null> {
  // PASO 1: Intentar con branches comunes primero (más rápido)
  const possibleBranches = ["main", "master", "develop", "dev"]
  
  for (const branch of possibleBranches) {
    const repositoryId = `${owner}/${repo}/${branch}`
    
    try {
      const index = await getRepositoryIndex(repositoryId)
      if (index) {
        console.log(`[STATUS] Índice encontrado en filesystem local: ${repositoryId}`)
        return { index, branch }
      }
    } catch (error) {
      // Continuar con el siguiente branch
      continue
    }
  }
  
  // PASO 2: Si no se encontró con branches comunes, buscar archivos que coincidan con el patrón
  try {
    const storageDir = join(process.cwd(), ".repository-indexes")
    const prefix = normalizeRepositoryIdForFile(`${owner}/${repo}/`)
    
    const files = await readdir(storageDir)
    const matchingFiles = files.filter(file => 
      file.startsWith(prefix) && file.endsWith(".json")
    )
    
    // Intentar leer el primer archivo que coincida
    for (const file of matchingFiles) {
      // Extraer branch del nombre del archivo: owner_repo_branch.json -> branch
      const withoutExtension = file.replace(".json", "")
      const parts = withoutExtension.split("_")
      if (parts.length >= 3) {
        const branch = parts.slice(2).join("_") // En caso de que el branch tenga guiones bajos
        const repositoryId = `${owner}/${repo}/${branch}`
        
        try {
          const index = await getRepositoryIndex(repositoryId)
          if (index) {
            console.log(`[STATUS] Índice encontrado en filesystem local (búsqueda por patrón): ${repositoryId}`)
            return { index, branch }
          }
        } catch (error) {
          continue
        }
      }
    }
  } catch (error) {
    // Si hay error al leer el directorio, continuar con el proxy
    console.log(`[STATUS] No se pudo leer directorio de índices: ${error instanceof Error ? error.message : "Error desconocido"}`)
  }
  
  return null
}

/**
 * GET /api/repository/status/:repositoryId
 * 
 * Comportamiento:
 * 1. Primero verifica si existe el índice en filesystem local
 * 2. Si existe, devuelve 200 con los datos del índice
 * 3. Si no existe, hace proxy al backend de Render
 * 4. Solo devuelve 400/404 si no existe en ningún lado
 * 
 * @param repositoryId - Formato: github:owner:repo
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { repositoryId: string } }
) {
  console.log(`[STATUS] GET /api/repository/status/${params.repositoryId} - Endpoint llamado`)
  
  try {
    const repositoryId = params.repositoryId
    
    // Validar formato de repositoryId
    if (!repositoryId || !repositoryId.startsWith("github:")) {
      return NextResponse.json(
        { error: "repositoryId debe tener formato: github:owner:repo" },
        { status: 400 }
      )
    }

    // Parsear repositoryId
    const parsed = parseRepositoryId(repositoryId)
    if (!parsed) {
      return NextResponse.json(
        { error: "repositoryId inválido. Formato esperado: github:owner:repo" },
        { status: 400 }
      )
    }

    const { owner, repo } = parsed

    // PASO 1: Verificar si existe el índice en filesystem local
    console.log(`[STATUS] Verificando filesystem local para ${owner}/${repo}`)
    const localIndex = await findIndexInFilesystem(owner, repo)
    
    if (localIndex) {
      const { index, branch } = localIndex
      
      // Devolver respuesta con formato esperado por el frontend
      return NextResponse.json({
        status: "completed",
        repositoryId: `github:${owner}:${repo}`,
        owner,
        repo,
        branch,
        indexedAt: index.indexedAt,
        totalFiles: index.summary?.totalFiles || index.files?.length || 0,
        stats: {
          totalFiles: index.summary?.totalFiles || index.files?.length || 0,
          totalLines: index.summary?.totalLines || 0,
          languages: index.summary?.languages || {},
        },
      }, { status: 200 })
    }

    // PASO 2: Si no existe localmente, hacer proxy al backend de Render
    console.log(`[STATUS] Índice no encontrado localmente, consultando backend de Render`)
    const controlFileUrl = process.env.CONTROLFILE_URL || process.env.NEXT_PUBLIC_CONTROLFILE_URL
    if (!controlFileUrl) {
      console.error("[STATUS] CONTROLFILE_URL no configurada")
      return NextResponse.json(
        { error: "Configuración del backend no disponible" },
        { status: 500 }
      )
    }
    
    // El backend espera: GET /api/repository/status/:repositoryId
    const backendUrl = `${controlFileUrl}/api/repository/status/${repositoryId}`
    console.log(`[STATUS] Consultando backend: ${backendUrl}`)

    try {
      const backendResponse = await fetch(backendUrl, {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
        },
      })

      const responseData = await backendResponse.json()
      console.log(`[STATUS] Respuesta del backend: ${backendResponse.status}`)

      // Retornar respuesta del backend
      return NextResponse.json(responseData, {
        status: backendResponse.status,
      })
    } catch (fetchError) {
      console.error("[STATUS] Error al comunicarse con ControlFile:", fetchError)
      return NextResponse.json(
        {
          error: "Error al comunicarse con el backend de indexación",
          details: fetchError instanceof Error ? fetchError.message : "Error desconocido",
        },
        { status: 502 }
      )
    }
  } catch (error) {
    console.error("Error en GET /api/repository/status/:repositoryId:", error)
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Error desconocido",
      },
      { status: 500 }
    )
  }
}

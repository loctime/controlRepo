// app/api/repository/status/route.ts
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
 * Normaliza languages para que siempre sea un array de strings
 * - Si es array → usarlo
 * - Si es objeto (mapa) → Object.keys(languages)
 * - Si no existe → []
 */
function normalizeLanguages(languages: any): string[] {
  if (Array.isArray(languages)) {
    return languages
  }
  if (languages && typeof languages === "object") {
    return Object.keys(languages)
  }
  return []
}

/**
 * Busca un índice en el filesystem local
 * Usa formato: github:owner:repo.json y owner/repo/branch.json (normalizado)
 */
async function findIndexInFilesystem(repositoryId: string, owner: string, repo: string): Promise<{ index: any; branch: string } | null> {
  // PASO 1: Intentar con el formato github:owner:repo
  // Normalizar para filesystem: github:owner:repo -> github_owner_repo.json
  try {
    const normalizedBackendFormat = normalizeRepositoryIdForFile(repositoryId)
    const storageDir = join(process.cwd(), ".repository-indexes")
    const backendFormatPath = join(storageDir, `${normalizedBackendFormat}.json`)
    
    const { readFile } = await import("fs/promises")
    const content = await readFile(backendFormatPath, "utf-8")
    const index = JSON.parse(content)
    
    if (index && index.branch) {
      console.log(`[STATUS] Índice encontrado en filesystem local (formato backend): ${repositoryId}`)
      return { index, branch: index.branch }
    }
  } catch (error: any) {
    // Archivo no existe o error de lectura, continuar
    if (error?.code !== "ENOENT") {
      console.log(`[STATUS] Error al leer índice en formato backend: ${error instanceof Error ? error.message : "Error desconocido"}`)
    }
  }
  
  // PASO 2: Intentar con formato local: owner/repo/branch
  const possibleBranches = ["main", "master", "develop", "dev"]
  
  for (const branch of possibleBranches) {
    const localRepositoryId = `${owner}/${repo}/${branch}`
    
    try {
      const index = await getRepositoryIndex(localRepositoryId)
      if (index) {
        console.log(`[STATUS] Índice encontrado en filesystem local (formato local): ${localRepositoryId}`)
        return { index, branch }
      }
    } catch (error) {
      // Continuar con el siguiente branch
      continue
    }
  }
  
  // PASO 3: Buscar archivos que coincidan con el patrón owner_repo_*
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
 * GET /api/repository/status?repositoryId=...
 * 
 * Comportamiento:
 * 1. Verifica si existe el índice en filesystem local
 * 2. Si existe, devuelve 200 con los datos del índice
 * 3. Si no existe, devuelve 404
 * 
 * @param repositoryId - Formato: github:owner:repo (query param)
 */
export async function GET(request: NextRequest) {
  const repositoryId = request.nextUrl.searchParams.get("repositoryId")
  
  console.log(`[STATUS] GET /api/repository/status?repositoryId=${repositoryId} - Endpoint llamado`)
  
  try {
    // Validar que repositoryId exista
    if (!repositoryId) {
      return NextResponse.json(
        { error: "repositoryId es requerido como query parameter" },
        { status: 400 }
      )
    }
    
    // Validar formato de repositoryId
    if (!repositoryId.startsWith("github:")) {
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
    console.log(`[STATUS] Verificando filesystem local para ${repositoryId}`)
    const localIndex = await findIndexInFilesystem(repositoryId, owner, repo)
    
    if (localIndex) {
      const { index, branch } = localIndex
      
      const totalSize = index.files?.reduce((sum, file) => sum + (file.size || 0), 0) || 0
      const totalFiles = index.summary?.totalFiles || index.files?.length || 0

      const normalizedStatus = index.status || "idle"
      const includeIndex = normalizedStatus === "completed"

      return NextResponse.json({
        status: normalizedStatus,
        repositoryId: `github:${owner}:${repo}`,
        owner,
        repo,
        branch,
        indexedAt: index.indexedAt,
        ...(includeIndex && {
          totalFiles,
          stats: {
            totalFiles,
            totalSize,
            totalLines: index.summary?.totalLines || 0,
            languages: normalizeLanguages(index.summary?.languages),
          },
          index,
        }),
        error: normalizedStatus === "error" ? "Error al indexar el repositorio" : null,
      }, { status: 200 })
    }

    return NextResponse.json(
      { error: "No existe índice local para este repositorio" },
      { status: 404 }
    )
  } catch (error) {
    console.error("Error en GET /api/repository/status:", error)
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Error desconocido",
      },
      { status: 500 }
    )
  }
}

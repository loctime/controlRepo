import { getRepositoryIndex } from "@/lib/repository/storage"
import { IndexedFile, RepositoryIndex } from "@/lib/types/repository"

interface Options {
  maxFiles: number
}

/**
 * Obtiene el índice del backend de Render si no existe localmente
 * Replica la lógica de fallback remoto de /api/repository/status
 */
async function getRepositoryIndexFromBackend(repositoryId: string): Promise<RepositoryIndex | null> {
  try {
    const controlFileUrl = process.env.CONTROLFILE_URL || process.env.NEXT_PUBLIC_CONTROLFILE_URL
    if (!controlFileUrl) {
      console.log(`[selectFilesFromIndex] CONTROLFILE_URL no configurada, no se puede consultar backend`)
      return null
    }

    // El backend espera: GET /api/repository/status/:repositoryId
    const backendUrl = `${controlFileUrl}/api/repository/status/${repositoryId}`
    console.log(`[selectFilesFromIndex] Consultando backend para ${repositoryId}: ${backendUrl}`)

    const response = await fetch(backendUrl, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
      },
    })

    if (!response.ok) {
      console.log(`[selectFilesFromIndex] Backend respondió con status ${response.status} para ${repositoryId}`)
      return null
    }

    const data = await response.json()
    
    // El backend devuelve el índice completo en data.index cuando status === "completed" o "ready" (legacy)
    if (data.index && (data.index.status === "completed" || data.index.status === "ready")) {
      console.log(`[selectFilesFromIndex] Índice obtenido del backend para ${repositoryId}`)
      return data.index as RepositoryIndex
    }

    console.log(`[selectFilesFromIndex] Backend no tiene índice completado para ${repositoryId} (status: ${data.status})`)
    return null
  } catch (error) {
    console.error(`[selectFilesFromIndex] Error al obtener índice del backend para ${repositoryId}:`, error)
    return null
  }
}

export async function selectFilesFromIndex(
  repositoryId: string,
  analysis: any,
  jsonContext: any,
  options: Options,
  index?: RepositoryIndex | null
): Promise<IndexedFile[]> {
  // Si el índice se pasa como parámetro, usarlo directamente (preferido)
  // Si no, intentar cargarlo desde el filesystem (fallback para compatibilidad)
  let repositoryIndex = index
  
  if (!repositoryIndex) {
    // PASO 1: Intentar obtener del filesystem local
    repositoryIndex = await getRepositoryIndex(repositoryId)
    
    // PASO 2: Si no se encuentra localmente, hacer fallback al backend de Render
    // (replica la lógica de /api/repository/status)
    if (!repositoryIndex) {
      console.log(`[selectFilesFromIndex] Índice no encontrado localmente para ${repositoryId}, consultando backend`)
      repositoryIndex = await getRepositoryIndexFromBackend(repositoryId)
    }
  }

  if (!repositoryIndex) {
    throw new Error(`RepositoryIndex no encontrado para ${repositoryId}`)
  }

  if (!Array.isArray(repositoryIndex.files)) {
    throw new Error(`RepositoryIndex inválido: files no existe`)
  }

  const safeAnalysis = analysis ?? {}

  const signals: string[] = [
    ...(safeAnalysis.keywords || []),
    ...(safeAnalysis.entities || []),
    ...(safeAnalysis.actions || []),
  ].map(s => String(s).toLowerCase())

  if (signals.length === 0) {
    return []
  }

  const scored = repositoryIndex.files.map(file => {
    let score = 0

    const haystack = [
      file.path,
      file.summary?.description ?? "",
      ...(file.summary?.exports || []),
      ...(file.tags || []),
    ]
      .join(" ")
      .toLowerCase()

    for (const signal of signals) {
      if (haystack.includes(signal)) score += 1
    }

    if (file.category === "service") score += 2
    if (file.process?.actions?.length) score += 3

    return { file, score }
  })

  return scored
    .filter(s => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, options.maxFiles)
    .map(s => s.file)
}

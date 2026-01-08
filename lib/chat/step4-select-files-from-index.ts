import { getRepositoryIndex } from "@/lib/repository/storage"
import { IndexedFile, RepositoryIndex } from "@/lib/types/repository"

interface Options {
  maxFiles: number
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
    repositoryIndex = await getRepositoryIndex(repositoryId)
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

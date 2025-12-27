import { getRepositoryIndex } from "@/lib/repository/storage"
import { IndexedFile } from "@/lib/types/repository"

interface Options {
  maxFiles: number
}

export async function selectFilesFromIndex(
  repositoryId: string,
  analysis: any,
  jsonContext: any,
  options: Options
): Promise<IndexedFile[]> {
  const index = await getRepositoryIndex(repositoryId)

  if (!index) {
    throw new Error(`RepositoryIndex no encontrado para ${repositoryId}`)
  }

  if (!Array.isArray(index.files)) {
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

  const scored = index.files.map(file => {
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

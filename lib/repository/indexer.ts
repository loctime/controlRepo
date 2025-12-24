/**
 * Motor de indexación de repositorios
 * Procesa el árbol completo y genera RepositoryIndex
 * 
 * Guardas de seguridad:
 * - Límite máximo de 10,000 archivos para evitar sobrecarga
 * - Concurrencia controlada para operaciones de red (máx 4 simultáneas)
 * - Manejo robusto de errores parciales sin dejar estados inconsistentes
 */

import { getRepositoryTree, getRepositoryMetadata, getLastCommit, getFileContent, resolveRepositoryBranch } from "@/lib/github/client"
import { createIndexedFile } from "@/lib/repository/analyzer"
import { RepositoryIndex, IndexedFile, FileCategory } from "@/lib/types/repository"
import { processWithLimit } from "./concurrency"
import { getRepositoryIndex } from "./storage"
import { createRepositoryId } from "./utils"

// Límites de seguridad
const MAX_FILES = 10000
const KEY_FILES_CONCURRENCY = 4 // Máximo 4 archivos clave procesados simultáneamente

/**
 * Indexa un repositorio completo
 * @throws Error si el repositorio excede el límite de archivos
 */
export async function indexRepository(
  owner: string,
  repo: string,
  branch?: string
): Promise<RepositoryIndex> {
  // Resolver rama primero para crear repositoryId con branch
  let resolvedBranch: { branch: string; lastCommit: string }
  let existingIndex: RepositoryIndex | null

  // Si se proporciona branch, buscar índice con ese branch
  if (branch) {
    const repositoryId = createRepositoryId(owner, repo, branch)
    existingIndex = await getRepositoryIndex(repositoryId)
    if (existingIndex) {
      resolvedBranch = await resolveRepositoryBranch(owner, repo, branch)
    } else {
      // Si no existe, usar el branch proporcionado
      resolvedBranch = await resolveRepositoryBranch(owner, repo, branch)
    }
  } else {
    // Si no se proporciona branch, buscar cualquier índice existente del repo
    // Por ahora, intentar con "main" y "master" como fallback
    const possibleBranches = ["main", "master"]
    existingIndex = null
    for (const possibleBranch of possibleBranches) {
      const repositoryId = createRepositoryId(owner, repo, possibleBranch)
      existingIndex = await getRepositoryIndex(repositoryId)
      if (existingIndex) {
        resolvedBranch = await resolveRepositoryBranch(owner, repo, existingIndex.branch)
        break
      }
    }
    // Si no existe ningún índice, resolver con branch por defecto
    if (!existingIndex) {
      resolvedBranch = await resolveRepositoryBranch(owner, repo)
    }
  }

  const actualBranch = resolvedBranch.branch
  const lastCommit = resolvedBranch.lastCommit
  const repositoryId = createRepositoryId(owner, repo, actualBranch)

  // Obtener índice existente (debe existir porque se crea antes de llamar esta función)
  if (!existingIndex) {
    existingIndex = await getRepositoryIndex(repositoryId)
  }

  if (!existingIndex) {
    throw new Error(`Índice inicial no encontrado para ${repositoryId}. Debe crearse antes de iniciar la indexación.`)
  }

  // Actualizar repositoryId si cambió el branch
  if (existingIndex.id !== repositoryId) {
    existingIndex.id = repositoryId
  }

  // Obtener metadatos del repositorio (pueden haber cambiado)
  const repoMetadata = await getRepositoryMetadata(owner, repo)
  const defaultBranch = repoMetadata.default_branch

  // Obtener árbol completo
  const tree = await getRepositoryTree(owner, repo, actualBranch)

  // Filtrar solo archivos (blobs), excluir directorios
  const files = tree.tree.filter((item) => item.type === "blob")

  // Guarda de seguridad: abortar si el repositorio es demasiado grande
  if (files.length > MAX_FILES) {
    throw new Error(
      `El repositorio excede el límite de ${MAX_FILES} archivos (encontrados: ${files.length}). ` +
      `Por favor, indexa un repositorio más pequeño o contacta al administrador.`
    )
  }

  // Procesar archivos en paralelo (con límite de concurrencia)
  const indexedFiles: IndexedFile[] = []
  const keyFiles: {
    readme?: string
    packageJson?: string
    nextConfig?: string
    firebaseConfig?: string
    tsconfig?: string
    docs?: string[]
  } = {}

  // Identificar archivos clave primero
  for (const file of files) {
    const fileName = file.path.split("/").pop() || ""
    const lowerName = fileName.toLowerCase()

    if (lowerName === "readme.md" || lowerName === "readme") {
      keyFiles.readme = file.path
    } else if (fileName === "package.json") {
      keyFiles.packageJson = file.path
    } else if (fileName.startsWith("next.config.")) {
      keyFiles.nextConfig = file.path
    } else if (fileName.startsWith("firebase.") || fileName.includes("firestore.rules")) {
      keyFiles.firebaseConfig = file.path
    } else if (fileName.startsWith("tsconfig.")) {
      keyFiles.tsconfig = file.path
    } else if (file.path.toLowerCase().startsWith("docs/") && fileName.endsWith(".md")) {
      if (!keyFiles.docs) keyFiles.docs = []
      keyFiles.docs.push(file.path)
    }
  }

  // Procesar archivos clave primero (necesitan contenido para análisis)
  const keyFilePaths = [
    keyFiles.readme,
    keyFiles.packageJson,
    keyFiles.nextConfig,
    keyFiles.firebaseConfig,
    keyFiles.tsconfig,
    ...(keyFiles.docs || []),
  ].filter(Boolean) as string[]

  // Procesar archivos clave con contenido (con límite de concurrencia)
  const keyFileResults = await processWithLimit(
    keyFilePaths,
    async (path) => {
      try {
        const blob = await getFileContent(owner, repo, path, actualBranch)
        const content =
          blob.encoding === "base64" ? Buffer.from(blob.content, "base64").toString("utf-8") : blob.content
        const fileName = path.split("/").pop() || ""
        return await createIndexedFile(path, fileName, blob.sha, blob.size, content)
      } catch (error) {
        console.error(`Error al procesar archivo clave ${path}:`, error)
        // Continuar con metadata básica en caso de error
        const file = files.find((f) => f.path === path)
        if (file) {
          const fileName = path.split("/").pop() || ""
          return await createIndexedFile(path, fileName, file.sha, file.size || 0)
        }
        // Si no se encuentra el archivo, retornar null (se filtrará después)
        return null
      }
    },
    KEY_FILES_CONCURRENCY
  )

  // Filtrar resultados nulos y agregar a indexedFiles
  const validKeyFiles = keyFileResults.filter((file): file is IndexedFile => file !== null)
  indexedFiles.push(...validKeyFiles)

  // Procesar resto de archivos (solo metadata, sin contenido)
  const remainingFiles = files.filter((f) => !keyFilePaths.includes(f.path))

  // Procesar en lotes para evitar sobrecarga
  const BATCH_SIZE = 50
  for (let i = 0; i < remainingFiles.length; i += BATCH_SIZE) {
    const batch = remainingFiles.slice(i, i + BATCH_SIZE)
    const batchResults = await Promise.all(
      batch.map(async (file) => {
        const fileName = file.path.split("/").pop() || ""
        return createIndexedFile(file.path, fileName, file.sha, file.size || 0)
      })
    )
    indexedFiles.push(...batchResults)
  }

  // Construir mapa de relaciones (imports/importedBy)
  const pathToFile = new Map<string, IndexedFile>()
  indexedFiles.forEach((file) => {
    pathToFile.set(file.path, file)
  })

  // Procesar relaciones de imports
  for (const file of indexedFiles) {
    if (file.summary.imports && file.summary.imports.length > 0) {
      // Intentar resolver imports a paths del repositorio
      const importPaths: string[] = []
      for (const importPath of file.summary.imports) {
        // Buscar archivos que coincidan con el import
        if (importPath.startsWith("@/") || importPath.startsWith("./") || importPath.startsWith("../")) {
          // Path relativo o alias
          const resolvedPath = resolveImportPath(importPath, file.path, pathToFile)
          if (resolvedPath) {
            importPaths.push(resolvedPath)
          }
        }
      }
      file.relations.imports = importPaths

      // Actualizar importedBy en los archivos importados
      for (const importedPath of importPaths) {
        const importedFile = pathToFile.get(importedPath)
        if (importedFile && !importedFile.relations.importedBy.includes(file.path)) {
          importedFile.relations.importedBy.push(file.path)
        }
      }
    }
  }

  // Calcular resumen
  const summary = calculateSummary(indexedFiles)

  // Actualizar índice existente con los archivos procesados
  existingIndex.files = indexedFiles
  existingIndex.keyFiles = keyFiles
  existingIndex.summary = summary
  existingIndex.lastCommit = lastCommit
  existingIndex.indexedAt = new Date().toISOString()
  existingIndex.metadata = {
    description: repoMetadata.description || undefined,
    language: repoMetadata.language || undefined,
    stars: repoMetadata.stargazers_count,
    forks: repoMetadata.forks_count,
    topics: repoMetadata.topics,
    createdAt: repoMetadata.created_at,
    updatedAt: repoMetadata.updated_at,
  }
  // Nota: status se actualiza a "completed" en el endpoint después de guardar

  return existingIndex
}

/**
 * Resuelve un path de import a un path real del repositorio
 */
function resolveImportPath(
  importPath: string,
  currentFilePath: string,
  pathToFile: Map<string, IndexedFile>
): string | null {
  // Normalizar import path
  let normalized = importPath
  if (normalized.startsWith("@/")) {
    normalized = normalized.substring(2)
  }
  if (normalized.startsWith("./")) {
    normalized = normalized.substring(2)
  }

  const currentDir = currentFilePath.substring(0, currentFilePath.lastIndexOf("/")) || "/"

  // Resolver path relativo
  if (importPath.startsWith("../")) {
    const parts = importPath.split("/")
    let resolvedDir = currentDir
    for (const part of parts) {
      if (part === "..") {
        resolvedDir = resolvedDir.substring(0, resolvedDir.lastIndexOf("/")) || "/"
      } else if (part !== ".") {
        resolvedDir = resolvedDir === "/" ? `/${part}` : `${resolvedDir}/${part}`
      }
    }
    normalized = resolvedDir
  } else if (importPath.startsWith("./")) {
    normalized = currentDir === "/" ? `/${normalized}` : `${currentDir}/${normalized}`
  } else if (importPath.startsWith("@/")) {
    normalized = `/${normalized}`
  }

  // Buscar archivo exacto
  if (pathToFile.has(normalized)) {
    return normalized
  }

  // Buscar con extensiones comunes
  const extensions = [".ts", ".tsx", ".js", ".jsx", ".json"]
  for (const ext of extensions) {
    const withExt = normalized + ext
    if (pathToFile.has(withExt)) {
      return withExt
    }
    const withIndex = `${normalized}/index${ext}`
    if (pathToFile.has(withIndex)) {
      return withIndex
    }
  }

  return null
}

/**
 * Calcula el resumen del repositorio
 */
function calculateSummary(files: IndexedFile[]) {
  const languages: Record<string, number> = {}
  const categories: Record<FileCategory, number> = {
    component: 0,
    hook: 0,
    service: 0,
    config: 0,
    docs: 0,
    test: 0,
    utility: 0,
    style: 0,
    other: 0,
  }

  let totalLines = 0

  for (const file of files) {
    totalLines += file.lines

    if (file.language) {
      languages[file.language] = (languages[file.language] || 0) + file.lines
    }

    categories[file.category] = (categories[file.category] || 0) + 1
  }

  return {
    totalFiles: files.length,
    totalLines,
    languages,
    categories,
    structure: {
      components: categories.component,
      hooks: categories.hook,
      services: categories.service,
      configs: categories.config,
      docs: categories.docs,
      tests: categories.test,
    },
  }
}


/**
 * Analizador de archivos para extraer metadata, resúmenes y relaciones
 * NO incluye contenido crudo, solo procesamiento inteligente
 */

import { IndexedFile, FileCategory, FileType } from "@/lib/types/repository"

/**
 * Detecta el tipo de archivo basado en nombre y extensión
 */
export function detectFileType(path: string, name: string): FileType {
  const lowerPath = path.toLowerCase()
  const lowerName = name.toLowerCase()

  // Archivos clave
  if (lowerName === "readme.md" || lowerName === "readme") {
    return "readme"
  }
  if (lowerName === "package.json") {
    return "package-json"
  }
  if (lowerName.startsWith("next.config.")) {
    return "config"
  }
  if (lowerName.startsWith("tsconfig.")) {
    return "config"
  }
  if (lowerName.startsWith("tailwind.config.")) {
    return "config"
  }
  if (lowerName.startsWith("firebase.") || lowerName.includes("firestore.rules")) {
    return "firebase"
  }

  // Componentes
  if (lowerPath.includes("/components/") || lowerPath.includes("/component/")) {
    if (name.endsWith(".tsx")) return "component-tsx"
    if (name.endsWith(".jsx")) return "component-jsx"
  }

  // Hooks
  if (lowerPath.includes("/hooks/") || lowerPath.includes("/hook/")) {
    if (name.endsWith(".ts")) return "hook-ts"
    if (name.endsWith(".js")) return "hook-js"
  }

  // Services (solo /services/ o /service/, NO /lib/)
  if (lowerPath.includes("/services/") || lowerPath.includes("/service/")) {
    if (name.endsWith(".ts") && !name.endsWith(".d.ts")) return "service-ts"
    if (name.endsWith(".js")) return "service-js"
  }

  // API Routes (Next.js)
  if (lowerPath.includes("/api/") && (name === "route.ts" || name === "route.js")) {
    return "api-route"
  }

  // Otros tipos
  if (name.endsWith(".md") || name.endsWith(".mdx")) return "markdown"
  if (name.endsWith(".ts") && !name.endsWith(".d.ts")) return "typescript"
  if (name.endsWith(".js")) return "javascript"
  if (name.endsWith(".css")) return "css"
  if (name.endsWith(".scss") || name.endsWith(".sass")) return "scss"
  if (name.endsWith(".json")) return "json"
  if (name.endsWith(".yaml") || name.endsWith(".yml")) return "yaml"

  return "other"
}

/**
 * Detecta la categoría del archivo
 */
export function detectFileCategory(fileType: FileType, path: string): FileCategory {
  const lowerPath = path.toLowerCase()
  const fileName = path.split("/").pop() || ""

  switch (fileType) {
    case "readme":
    case "markdown":
      return "docs"
    case "package-json":
    case "config":
    case "firebase":
      return "config"
    case "component-tsx":
    case "component-jsx":
      return "component"
    case "hook-ts":
    case "hook-js":
      return "hook"
    case "service-ts":
    case "service-js":
    case "api-route":
      return "service"
    case "css":
    case "scss":
      return "style"
    default:
      if (lowerPath.includes("/test/") || lowerPath.includes("/__tests__/") || fileName.endsWith(".test.") || fileName.endsWith(".spec.")) {
        return "test"
      }
      if (lowerPath.includes("/utils/") || lowerPath.includes("/helpers/") || lowerPath.includes("/lib/")) {
        return "utility"
      }
      return "other"
  }
}

/**
 * Extrae tags del archivo basado en path, nombre y tipo
 */
export function extractTags(path: string, name: string, fileType: FileType): string[] {
  const tags: string[] = []
  const lowerPath = path.toLowerCase()
  const lowerName = name.toLowerCase()

  // Tags por tipo de archivo
  if (fileType.includes("tsx") || fileType.includes("ts")) {
    tags.push("typescript")
  }
  if (fileType.includes("jsx") || fileType.includes("js")) {
    tags.push("javascript")
  }
  if (fileType.includes("component")) {
    tags.push("react", "ui")
  }
  if (fileType.includes("hook")) {
    tags.push("react", "hook")
  }

  // Tags por ubicación
  if (lowerPath.includes("/components/")) tags.push("component")
  if (lowerPath.includes("/hooks/")) tags.push("hook")
  if (lowerPath.includes("/api/")) tags.push("api")
  if (lowerPath.includes("/lib/")) tags.push("library")
  if (lowerPath.includes("/utils/")) tags.push("utility")
  if (lowerPath.includes("/styles/") || lowerPath.includes("/css/")) tags.push("style")

  // Tags por nombre
  if (lowerName.includes("auth")) tags.push("authentication")
  if (lowerName.includes("firebase")) tags.push("firebase")
  if (lowerName.includes("form")) tags.push("form")
  if (lowerName.includes("button")) tags.push("button")
  if (lowerName.includes("modal") || lowerName.includes("dialog")) tags.push("modal")
  if (lowerName.includes("table")) tags.push("table")

  return [...new Set(tags)] // Eliminar duplicados
}

/**
 * Analiza contenido de archivo para extraer resumen (sin guardar contenido completo)
 * Esta función procesa el contenido en memoria pero solo extrae metadata
 * 
 * NOTA: Las regex utilizadas son HEURÍSTICAS y NO son exhaustivas.
 * Pueden no capturar todos los casos edge (imports dinámicos, sintaxis exótica, etc.).
 * El objetivo es extraer información útil para navegación y búsqueda, no análisis completo.
 */
export async function analyzeFileContent(
  content: string,
  path: string,
  fileType: FileType
): Promise<{
  description?: string
  exports?: string[]
  imports?: string[]
  dependencies?: string[]
  functions?: string[]
  hooks?: string[]
  props?: string[]
  lines: number
}> {
  const lines = content.split("\n").length
  const result = {
    lines,
    description: undefined as string | undefined,
    exports: undefined as string[] | undefined,
    imports: undefined as string[] | undefined,
    dependencies: undefined as string[] | undefined,
    functions: undefined as string[] | undefined,
    hooks: undefined as string[] | undefined,
    props: undefined as string[] | undefined,
  }

  // Extraer imports
  const importRegex = /import\s+(?:(?:\{[^}]*\}|\*\s+as\s+\w+|\w+)(?:\s*,\s*(?:\{[^}]*\}|\*\s+as\s+\w+|\w+))*\s+from\s+)?['"]([^'"]+)['"]/g
  const imports: string[] = []
  let match
  while ((match = importRegex.exec(content)) !== null) {
    const importPath = match[1]
    if (importPath && !importPath.startsWith(".") && !importPath.startsWith("/")) {
      imports.push(importPath.split("/")[0]) // Solo el paquete principal
    } else if (importPath) {
      imports.push(importPath)
    }
  }
  if (imports.length > 0) {
    result.imports = [...new Set(imports)].slice(0, 10) // Máximo 10 imports
  }

  // Extraer exports (TypeScript/JavaScript)
  if (fileType.includes("ts") || fileType.includes("js") || fileType.includes("component")) {
    const exportRegex = /export\s+(?:default\s+)?(?:function|const|class|interface|type|enum)\s+(\w+)/g
    const exports: string[] = []
    while ((match = exportRegex.exec(content)) !== null) {
      exports.push(match[1])
    }
    if (exports.length > 0) {
      result.exports = exports
    }

    // Extraer funciones
    const functionRegex = /(?:export\s+)?(?:async\s+)?function\s+(\w+)|(?:export\s+)?const\s+(\w+)\s*=\s*(?:\([^)]*\)\s*=>|function)/
    const functions: string[] = []
    while ((match = functionRegex.exec(content)) !== null) {
      const funcName = match[1] || match[2]
      if (funcName) functions.push(funcName)
    }
    if (functions.length > 0) {
      result.functions = functions.slice(0, 20) // Máximo 20 funciones
    }

    // Extraer hooks (use*)
    const hookRegex = /(?:export\s+)?(?:const|function)\s+(use\w+)\s*=/g
    const hooks: string[] = []
    while ((match = hookRegex.exec(content)) !== null) {
      hooks.push(match[1])
    }
    if (hooks.length > 0) {
      result.hooks = hooks
    }

    // Extraer props/interfaces
    const propsRegex = /(?:interface|type)\s+(\w+Props|Props)\s*\{([\s\S]+?)\}/
    const propsMatch = propsRegex.exec(content)
    if (propsMatch) {
      const propsContent = propsMatch[2]
      const propNames = propsContent
        .split("\n")
        .map((line) => line.trim().split(/[?:=]/)[0].trim())
        .filter((name) => name && !name.startsWith("//"))
      if (propNames.length > 0) {
        result.props = propNames.slice(0, 15) // Máximo 15 props
      }
    }
  }

  // Extraer descripción de JSDoc o primera línea de comentario
  const jsdocRegex = /\/\*\*\s*\n\s*\*\s*([\s\S]+?)\n/
  const jsdocMatch = jsdocRegex.exec(content)
  if (jsdocMatch) {
    result.description = jsdocMatch[1].trim().substring(0, 200)
  } else {
    // Buscar comentario de una línea
    const commentRegex = /\/\/\s*(.+)/m
    const commentMatch = commentRegex.exec(content)
    if (commentMatch) {
      result.description = commentMatch[1].trim().substring(0, 200)
    }
  }

  // Para package.json, extraer dependencias
  if (fileType === "package-json") {
    try {
      const packageJson = JSON.parse(content)
      const deps = [
        ...Object.keys(packageJson.dependencies || {}),
        ...Object.keys(packageJson.devDependencies || {}),
      ]
      if (deps.length > 0) {
        result.dependencies = deps.slice(0, 30) // Máximo 30 dependencias
      }
    } catch {
      // Ignorar errores de parsing
    }
  }

  return result
}

/**
 * Extrae relaciones de imports (paths relativos)
 * 
 * NOTA: Esta función usa heurísticas de regex y puede no capturar todos los casos.
 * Es complementaria a analyzeFileContent() pero enfocada en relaciones entre archivos.
 * Se usa para construir el grafo de dependencias del repositorio.
 */
export function extractImportRelations(content: string, currentPath: string): string[] {
  const relations: string[] = []
  const importRegex = /from\s+['"]([^'"]+)['"]/g
  let match

  while ((match = importRegex.exec(content)) !== null) {
    const importPath = match[1]
    // Solo paths relativos o absolutos del proyecto
    if (importPath.startsWith(".") || importPath.startsWith("/") || importPath.startsWith("@/")) {
      // Normalizar path
      let normalizedPath = importPath
      if (normalizedPath.startsWith("@/")) {
        normalizedPath = normalizedPath.substring(2)
      }
      if (normalizedPath.startsWith("./")) {
        normalizedPath = normalizedPath.substring(2)
      }
      if (normalizedPath.startsWith("../")) {
        // Resolver path relativo (simplificado)
        const currentDir = currentPath.substring(0, currentPath.lastIndexOf("/"))
        normalizedPath = resolveRelativePath(currentDir, normalizedPath)
      }
      if (!normalizedPath.startsWith("http") && normalizedPath !== currentPath) {
        relations.push(normalizedPath)
      }
    }
  }

  return [...new Set(relations)]
}

/**
 * Resuelve path relativo (simplificado)
 */
function resolveRelativePath(base: string, relative: string): string {
  if (!relative.startsWith("../")) return relative

  const baseParts = base.split("/").filter(Boolean)
  const relativeParts = relative.split("/").filter(Boolean)

  for (const part of relativeParts) {
    if (part === "..") {
      baseParts.pop()
    } else {
      baseParts.push(part)
    }
  }

  return "/" + baseParts.join("/")
}

/**
 * Crea un IndexedFile desde datos de GitHub
 */
export async function createIndexedFile(
  path: string,
  name: string,
  sha: string,
  size: number,
  content?: string // Solo para análisis, no se guarda
): Promise<IndexedFile> {
  const directory = path.substring(0, path.lastIndexOf("/")) || "/"
  const fileType = detectFileType(path, name)
  const category = detectFileCategory(fileType, path)
  const tags = extractTags(path, name, fileType)

  // Analizar contenido si está disponible
  let summary: IndexedFile["summary"]
  let lines: number

  if (content) {
    const analysis = await analyzeFileContent(content, path, fileType)
    lines = analysis.lines
    summary = {
      description: analysis.description,
      imports: analysis.imports,
      exports: analysis.exports,
      dependencies: analysis.dependencies,
      functions: analysis.functions,
      hooks: analysis.hooks,
      props: analysis.props,
    }
  } else {
    // Estimar líneas basado en tamaño (aproximación: ~50 caracteres por línea)
    lines = Math.max(1, Math.floor(size / 50))
    summary = {}
  }

  // Detectar archivos clave
  const isKeyFile =
    name.toLowerCase() === "readme.md" ||
    name === "package.json" ||
    name.startsWith("next.config.") ||
    name.startsWith("tsconfig.") ||
    name.startsWith("firebase.")

  const isDocumentation =
    category === "docs" || path.toLowerCase().includes("/docs/") || name.endsWith(".md")

  return {
    path,
    name,
    directory,
    size,
    sha,
    language: detectLanguage(name, fileType),
    lines,
    category,
    type: fileType,
    tags,
    summary,
    relations: {
      imports: content ? extractImportRelations(content, path) : [],
      importedBy: [], // Se llena después cuando se procesan todos los archivos
      dependsOn: [],
      requiredBy: [],
      related: [],
    },
    isKeyFile,
    isDocumentation,
  }
}

/**
 * Detecta lenguaje del archivo
 */
function detectLanguage(name: string, fileType: FileType): string | undefined {
  if (fileType.includes("typescript") || fileType.includes("tsx") || fileType.includes("ts")) {
    return "typescript"
  }
  if (fileType.includes("javascript") || fileType.includes("jsx") || fileType.includes("js")) {
    return "javascript"
  }
  if (fileType === "markdown" || name.endsWith(".md")) {
    return "markdown"
  }
  if (fileType === "css" || name.endsWith(".css")) {
    return "css"
  }
  if (fileType === "scss" || name.endsWith(".scss")) {
    return "scss"
  }
  if (fileType === "json" || name.endsWith(".json")) {
    return "json"
  }
  if (fileType === "yaml" || name.endsWith(".yaml") || name.endsWith(".yml")) {
    return "yaml"
  }
  return undefined
}


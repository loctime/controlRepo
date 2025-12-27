/**
 * Analizador de archivos para extraer metadata, resúmenes y relaciones
 * NO incluye contenido crudo, solo procesamiento inteligente
 */

import { IndexedFile, FileCategory, FileType } from "@/lib/types/repository"
import { analyzeProcessFile } from "@/lib/repository/process-analyzer"

/**
 * Detecta el tipo de archivo basado en nombre y extensión
 */
export function detectFileType(path: string, name: string): FileType {
  const lowerPath = path.toLowerCase()
  const lowerName = name.toLowerCase()

  if (lowerName === "readme.md" || lowerName === "readme") return "readme"
  if (lowerName === "package.json") return "package-json"
  if (
    lowerName.startsWith("next.config.") ||
    lowerName.startsWith("tsconfig.") ||
    lowerName.startsWith("tailwind.config.")
  ) return "config"
  if (lowerName.startsWith("firebase.") || lowerName.includes("firestore.rules")) {
    return "firebase"
  }

  if (lowerPath.includes("/components/") || lowerPath.includes("/component/")) {
    if (name.endsWith(".tsx")) return "component-tsx"
    if (name.endsWith(".jsx")) return "component-jsx"
  }

  if (lowerPath.includes("/hooks/") || lowerPath.includes("/hook/")) {
    if (name.endsWith(".ts")) return "hook-ts"
    if (name.endsWith(".js")) return "hook-js"
  }

  if (lowerPath.includes("/services/") || lowerPath.includes("/service/")) {
    if (name.endsWith(".ts") && !name.endsWith(".d.ts")) return "service-ts"
    if (name.endsWith(".js")) return "service-js"
  }

  if (lowerPath.includes("/api/") && (name === "route.ts" || name === "route.js")) {
    return "api-route"
  }

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
      if (
        lowerPath.includes("/test/") ||
        lowerPath.includes("/__tests__/") ||
        fileName.includes(".test.") ||
        fileName.includes(".spec.")
      ) {
        return "test"
      }
      if (
        lowerPath.includes("/utils/") ||
        lowerPath.includes("/helpers/") ||
        lowerPath.includes("/lib/")
      ) {
        return "utility"
      }
      return "other"
  }
}

/**
 * Extrae tags semánticos del archivo
 */
export function extractTags(path: string, name: string, fileType: FileType): string[] {
  const tags = new Set<string>()
  const lowerPath = path.toLowerCase()
  const lowerName = name.toLowerCase()

  if (fileType.includes("ts")) tags.add("typescript")
  if (fileType.includes("js")) tags.add("javascript")
  if (fileType.includes("component")) {
    tags.add("react")
    tags.add("ui")
  }
  if (fileType.includes("hook")) {
    tags.add("react")
    tags.add("hook")
  }

  if (lowerPath.includes("/components/")) tags.add("component")
  if (lowerPath.includes("/hooks/")) tags.add("hook")
  if (lowerPath.includes("/api/")) tags.add("api")
  if (lowerPath.includes("/lib/")) tags.add("library")
  if (lowerPath.includes("/styles/")) tags.add("style")

  if (lowerName.includes("auth")) tags.add("authentication")
  if (lowerName.includes("firebase")) tags.add("firebase")
  if (lowerName.includes("form")) tags.add("form")
  if (lowerName.includes("table")) tags.add("table")
  if (lowerName.includes("modal") || lowerName.includes("dialog")) tags.add("modal")

  return Array.from(tags)
}

/**
 * Analiza contenido del archivo (metadata, no contenido crudo)
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
  const result: any = { lines }

  const importRx = /import\s+.*?\s+from\s+['"]([^'"]+)['"]/g
  const imports: string[] = []
  let m
  while ((m = importRx.exec(content))) imports.push(m[1])
  if (imports.length) result.imports = [...new Set(imports)].slice(0, 10)

  if (fileType.includes("ts") || fileType.includes("js")) {
    const exportRx = /export\s+(?:async\s+)?(?:function|const|class|interface|type)\s+(\w+)/g
    const exports: string[] = []
    while ((m = exportRx.exec(content))) exports.push(m[1])
    if (exports.length) result.exports = exports

    const hookRx = /(?:const|function)\s+(use\w+)/g
    const hooks: string[] = []
    while ((m = hookRx.exec(content))) hooks.push(m[1])
    if (hooks.length) result.hooks = hooks
  }

  const jsdocRx = /\/\*\*\s*\n\s*\*\s*(.+)/m
  const jsdocMatch = jsdocRx.exec(content)
  if (jsdocMatch) {
    result.description = jsdocMatch[1].trim().substring(0, 200)
  }

  if (fileType === "package-json") {
    try {
      const pkg = JSON.parse(content)
      result.dependencies = [
        ...Object.keys(pkg.dependencies || {}),
        ...Object.keys(pkg.devDependencies || {}),
      ].slice(0, 30)
    } catch {}
  }

  return result
}

/**
 * Extrae relaciones de imports (paths relativos)
 */
export function extractImportRelations(content: string, currentPath: string): string[] {
  const rx = /from\s+['"]([^'"]+)['"]/g
  const relations = new Set<string>()
  let m

  while ((m = rx.exec(content))) {
    const p = m[1]
    if (p.startsWith(".") || p.startsWith("/") || p.startsWith("@/")) {
      relations.add(p.replace("@/", "/"))
    }
  }

  return Array.from(relations)
}

/**
 * Crea un IndexedFile (INTEGRADO con process-analyzer)
 */
export async function createIndexedFile(
  path: string,
  name: string,
  sha: string,
  size: number,
  content?: string
): Promise<IndexedFile> {
  const directory = path.substring(0, path.lastIndexOf("/")) || "/"
  const type = detectFileType(path, name)
  const category = detectFileCategory(type, path)
  const tags = extractTags(path, name, type)

  const process = analyzeProcessFile(path, content)

  let summary: IndexedFile["summary"]
  let lines: number

  if (content) {
    const analysis = await analyzeFileContent(content, path, type)
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
    lines = Math.max(1, Math.floor(size / 50))
    summary = {}
  }

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
    language: detectLanguage(name, type),
    lines,
    category,
    type,
    tags,
    summary,
    relations: {
      imports: content ? extractImportRelations(content, path) : [],
      importedBy: [],
      dependsOn: [],
      requiredBy: [],
      related: [],
    },
    isKeyFile,
    isDocumentation,
    process,
  }
}

/**
 * Detecta lenguaje
 */
function detectLanguage(name: string, type: FileType): string | undefined {
  if (type.includes("ts")) return "typescript"
  if (type.includes("js")) return "javascript"
  if (type === "markdown") return "markdown"
  if (type === "css") return "css"
  if (type === "scss") return "scss"
  if (type === "json") return "json"
  if (type === "yaml") return "yaml"
  return undefined
}

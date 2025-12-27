/**
 * Tipos para el sistema de indexación de repositorios
 * Modelo RepositoryIndex - Estructura plana sin contenido crudo
 */

export type FileCategory =
  | "component"
  | "hook"
  | "service"
  | "config"
  | "docs"
  | "test"
  | "utility"
  | "style"
  | "other"

export type FileType =
  | "readme"
  | "package-json"
  | "config"
  | "firebase"
  | "component-tsx"
  | "component-jsx"
  | "hook-ts"
  | "hook-js"
  | "service-ts"
  | "service-js"
  | "api-route"
  | "markdown"
  | "typescript"
  | "javascript"
  | "css"
  | "scss"
  | "json"
  | "yaml"
  | "other"

export type IndexStatus = "indexing" | "completed" | "error"
export type FileProcessRole =
  | "entrypoint"
  | "orchestrator"
  | "worker"
  | "utility"
  | "config"
  | "unknown"

export interface FileProcessInfo {
  role: FileProcessRole
  entrypoint: boolean
  actions: string[]
  callsApi: string[]
}

export interface IndexedFile {
  // Identificación
  path: string // Ruta completa desde raíz: "/components/Button.tsx"
  name: string // Nombre del archivo: "Button.tsx"
  directory: string // Directorio: "/components"

  // Metadatos básicos
  size: number // Tamaño en bytes
  sha: string // SHA del blob en GitHub
  language?: string // Lenguaje detectado: "typescript", "javascript", etc.
  lines: number // Número de líneas

  // Clasificación
  category: FileCategory
  type: FileType
  tags: string[] // Tags extraídos: ["react", "typescript", "ui", "form"]

  // Resumen (NO contenido crudo)
  summary: {
    description?: string // Descripción extraída (comentarios JSDoc, primera línea, etc.)
    exports?: string[] // Nombres de exports: ["Button", "ButtonProps", "default"]
    imports?: string[] // Imports principales: ["react", "@/lib/utils"]
    dependencies?: string[] // Dependencias detectadas (para package.json, etc.)
    functions?: string[] // Nombres de funciones/clases exportadas
    hooks?: string[] // Nombres de hooks (si es hook)
    props?: string[] // Props principales (si es component)
  }

  // Relaciones (referencias a otros archivos)
  relations: {
    imports: string[] // Paths de archivos que este archivo importa
    importedBy: string[] // Paths de archivos que importan este archivo
    dependsOn: string[] // Paths de archivos de los que depende
    requiredBy: string[] // Paths de archivos que requieren este archivo
    related: string[] // Paths de archivos relacionados (mismo directorio, mismo propósito)
  }

  // Metadatos adicionales
  isKeyFile: boolean // true si es archivo clave (README, package.json, etc.)
  isDocumentation: boolean // true si es documentación
  lastModified?: string // Fecha de última modificación (si disponible)
  // Análisis de procesos (flows, comportamiento)
  process?: FileProcessInfo

}

export interface RepositoryMetadata {
  description?: string
  language?: string
  stars?: number
  forks?: number
  topics?: string[]
  createdAt?: string
  updatedAt?: string
}

export interface RepositoryIndex {
  // Identificación
  id: string // "owner/repo"
  owner: string
  repo: string
  branch: string
  defaultBranch: string

  // Estado del índice
  status: IndexStatus
  indexedAt: string // ISO 8601
  lastCommit: string // SHA del último commit indexado

  // Metadatos del repositorio
  metadata: RepositoryMetadata

  // Estructura plana de archivos indexados
  files: IndexedFile[]

  // Archivos clave (referencias por path)
  keyFiles: {
    readme?: string // path del README
    packageJson?: string // path del package.json
    nextConfig?: string // path del next.config.*
    firebaseConfig?: string // path del firebase.*
    tsconfig?: string // path del tsconfig.json
    docs?: string[] // paths de archivos en /docs
  }

  // Resumen del repositorio
  summary: {
    totalFiles: number
    totalLines: number
    languages: Record<string, number> // { "typescript": 5000, "javascript": 2000 }
    categories: Record<FileCategory, number>
    structure: {
      components: number
      hooks: number
      services: number
      configs: number
      docs: number
      tests: number
    }
  }
}

export interface IndexResponse {
  status: "indexing" | "completed" | "error"
  repositoryId: string // "owner/repo"
  message?: string
  error?: string
}

export interface IndexLock {
  repositoryId: string
  lockedAt: string // ISO 8601
  lockedBy: string // userId o "system"
  expiresAt: string // ISO 8601 (lock expira después de 30 minutos)
}


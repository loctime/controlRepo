"use client"

import { useState, useEffect } from "react"
import { Card } from "@/components/ui/card"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { FileText, Map, GitBranch, Code2, Package, Settings, BookOpen, TestTube, Wrench, Palette } from "lucide-react"
import { useRepository } from "@/lib/repository-context"
import { FileCategory } from "@/lib/types/repository"

// Iconos por categoría
const categoryIcons: Record<FileCategory, typeof Code2> = {
  component: Code2,
  hook: GitBranch,
  service: Package,
  config: Settings,
  docs: BookOpen,
  test: TestTube,
  utility: Wrench,
  style: Palette,
  other: FileText,
}

// Etiquetas legibles por categoría
const categoryLabels: Record<FileCategory, string> = {
  component: "Componentes",
  hook: "Hooks",
  service: "Servicios",
  config: "Configuración",
  docs: "Documentación",
  test: "Tests",
  utility: "Utilidades",
  style: "Estilos",
  other: "Otros",
}

export function SidebarPanel() {
  const { currentIndex, getFilesByCategory, reindexRepository } = useRepository()
  const [branches, setBranches] = useState<string[]>([])
  const [loadingBranches, setLoadingBranches] = useState(false)

  // Detectar si hay índice disponible
  const hasIndex = currentIndex !== null

  // Obtener ramas disponibles cuando hay un índice
  useEffect(() => {
    if (currentIndex?.owner && currentIndex?.repo) {
      setLoadingBranches(true)
      fetch(`/api/repository/branches?owner=${encodeURIComponent(currentIndex.owner)}&repo=${encodeURIComponent(currentIndex.repo)}`)
        .then((res) => res.json())
        .then((data) => {
          if (data.branches) {
            setBranches(data.branches)
          }
        })
        .catch((err) => {
          console.error("Error al obtener ramas:", err)
        })
        .finally(() => {
          setLoadingBranches(false)
        })
    }
  }, [currentIndex?.owner, currentIndex?.repo])

  // Handler para cambiar de rama
  const handleBranchChange = async (newBranch: string) => {
    if (!currentIndex || newBranch === currentIndex.branch) return
    
    try {
      await reindexRepository(currentIndex.owner, currentIndex.repo, newBranch)
    } catch (error) {
      console.error("Error al cambiar de rama:", error)
    }
  }

  // Obtener archivos por categoría cuando hay índice
  const components = hasIndex ? getFilesByCategory("component") : []
  const hooks = hasIndex ? getFilesByCategory("hook") : []
  const services = hasIndex ? getFilesByCategory("service") : []
  const configs = hasIndex ? getFilesByCategory("config") : []
  const docs = hasIndex ? getFilesByCategory("docs") : []
  const tests = hasIndex ? getFilesByCategory("test") : []
  const utilities = hasIndex ? getFilesByCategory("utility") : []
  const styles = hasIndex ? getFilesByCategory("style") : []

  // Obtener lenguajes principales (top 5)
  const topLanguages = hasIndex && currentIndex?.summary?.languages
    ? Object.entries(currentIndex.summary.languages)
        .sort(([, a], [, b]) => b - a)
        .slice(0, 5)
        .map(([lang]) => lang)
    : []

  return (
    <Card className="h-full border-border py-0 gap-0 flex flex-col overflow-hidden">
      <Tabs defaultValue="architecture" className="h-full flex flex-col min-h-0">
        {/* Header fijo de tabs - NO scrollable */}
        <div className="border-b border-border px-3 pt-2 pb-2 shrink-0">
          <TabsList className="w-full grid grid-cols-3 gap-2">
            <TabsTrigger value="architecture" className="flex items-center gap-2">
              <FileText className="h-4 w-4" />
              <span className="hidden md:inline">Arquitectura</span>
            </TabsTrigger>
            <TabsTrigger value="modules" className="flex items-center gap-2">
              <Map className="h-4 w-4" />
              <span className="hidden md:inline">Módulos</span>
            </TabsTrigger>
            <TabsTrigger value="flows" className="flex items-center gap-2">
              <GitBranch className="h-4 w-4" />
              <span className="hidden md:inline">Flujos</span>
            </TabsTrigger>
          </TabsList>
        </div>

        {/* Contenido scrollable - solo el cuerpo */}
        <ScrollArea className="flex-1 min-h-0 p-3">
          <TabsContent value="architecture" className="mt-0">
            <div className="space-y-4">
              {hasIndex ? (
                <>
                  <div>
                    <h3 className="font-semibold mb-2 text-foreground">Resumen del Repositorio</h3>
                    <div className="space-y-2 text-sm text-muted-foreground">
                      <div className="flex justify-between">
                        <span>Archivos totales:</span>
                        <span className="font-medium text-foreground">{currentIndex?.summary?.totalFiles.toLocaleString() ?? 0}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Líneas de código:</span>
                        <span className="font-medium text-foreground">{currentIndex?.summary?.totalLines.toLocaleString() ?? 0}</span>
                      </div>
                      {currentIndex?.metadata?.language && (
                        <div className="flex justify-between">
                          <span>Lenguaje principal:</span>
                          <span className="font-medium text-foreground">{currentIndex.metadata.language}</span>
                        </div>
                      )}
                    </div>
                  </div>

                  {topLanguages.length > 0 && (
                    <div>
                      <h3 className="font-semibold mb-2 text-foreground">Lenguajes Detectados</h3>
                      <div className="flex flex-wrap gap-2">
                        {topLanguages.map((lang) => (
                          <span
                            key={lang}
                            className="px-2 py-1 text-xs rounded-md bg-muted text-muted-foreground font-medium"
                          >
                            {lang}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  <div>
                    <h3 className="font-semibold mb-2 text-foreground">Estructura por Categorías</h3>
                    <div className="space-y-2 text-sm">
                      {Object.entries(currentIndex?.summary?.categories ?? {}).map(([category, count]) => {
                        if (count === 0) return null
                        const Icon = categoryIcons[category as FileCategory]
                        return (
                          <div key={category} className="flex items-center justify-between text-muted-foreground">
                            <div className="flex items-center gap-2">
                              {Icon && <Icon className="h-4 w-4" />}
                              <span>{categoryLabels[category as FileCategory]}</span>
                            </div>
                            <span className="font-medium text-foreground">{count}</span>
                          </div>
                        )
                      })}
                    </div>
                  </div>

                  {currentIndex?.metadata?.description && (
                    <div>
                      <h3 className="font-semibold mb-2 text-foreground">Descripción</h3>
                      <p className="text-sm text-muted-foreground leading-relaxed">{currentIndex.metadata.description}</p>
                    </div>
                  )}
                </>
              ) : (
                <>
                  <div>
                    <h3 className="font-semibold mb-2 text-foreground">Estructura General</h3>
                    <p className="text-sm text-muted-foreground leading-relaxed">
                      El proyecto sigue una arquitectura modular basada en Next.js con componentes React reutilizables.
                    </p>
                  </div>
                  <div>
                    <h3 className="font-semibold mb-2 text-foreground">Capas</h3>
                    <ul className="space-y-2 text-sm text-muted-foreground">
                      <li className="flex items-start gap-2">
                        <span className="text-primary">•</span>
                        <span>Presentación: Componentes UI</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <span className="text-primary">•</span>
                        <span>Lógica: Hooks personalizados</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <span className="text-primary">•</span>
                        <span>Datos: API endpoints</span>
                      </li>
                    </ul>
                  </div>
                  <div className="pt-2 border-t border-border">
                    <p className="text-xs text-muted-foreground italic">
                      Indexa un repositorio para ver información detallada de su arquitectura.
                    </p>
                  </div>
                </>
              )}
            </div>
          </TabsContent>

          <TabsContent value="modules" className="mt-0">
            <div className="space-y-4">
              {hasIndex ? (
                <>
                  {components.length > 0 && (
                    <div>
                      <div className="flex items-center gap-2 mb-2">
                        <Code2 className="h-4 w-4 text-primary" />
                        <h3 className="font-semibold text-foreground">Componentes</h3>
                        <span className="text-xs text-muted-foreground">({components.length})</span>
                      </div>
                      <p className="text-sm text-muted-foreground leading-relaxed">
                        {components.length} componente{components.length !== 1 ? "s" : ""} React reutilizable{components.length !== 1 ? "s" : ""} para la interfaz de usuario.
                      </p>
                    </div>
                  )}

                  {hooks.length > 0 && (
                    <div>
                      <div className="flex items-center gap-2 mb-2">
                        <GitBranch className="h-4 w-4 text-primary" />
                        <h3 className="font-semibold text-foreground">Hooks</h3>
                        <span className="text-xs text-muted-foreground">({hooks.length})</span>
                      </div>
                      <p className="text-sm text-muted-foreground leading-relaxed">
                        {hooks.length} hook{hooks.length !== 1 ? "s" : ""} personalizado{hooks.length !== 1 ? "s" : ""} para lógica reutilizable.
                      </p>
                    </div>
                  )}

                  {services.length > 0 && (
                    <div>
                      <div className="flex items-center gap-2 mb-2">
                        <Package className="h-4 w-4 text-primary" />
                        <h3 className="font-semibold text-foreground">Servicios</h3>
                        <span className="text-xs text-muted-foreground">({services.length})</span>
                      </div>
                      <p className="text-sm text-muted-foreground leading-relaxed">
                        {services.length} servicio{services.length !== 1 ? "s" : ""} y endpoint{services.length !== 1 ? "s" : ""} de API para manejo de datos.
                      </p>
                    </div>
                  )}

                  {configs.length > 0 && (
                    <div>
                      <div className="flex items-center gap-2 mb-2">
                        <Settings className="h-4 w-4 text-primary" />
                        <h3 className="font-semibold text-foreground">Configuración</h3>
                        <span className="text-xs text-muted-foreground">({configs.length})</span>
                      </div>
                      <p className="text-sm text-muted-foreground leading-relaxed">
                        {configs.length} archivo{configs.length !== 1 ? "s" : ""} de configuración del proyecto.
                      </p>
                    </div>
                  )}

                  {docs.length > 0 && (
                    <div>
                      <div className="flex items-center gap-2 mb-2">
                        <BookOpen className="h-4 w-4 text-primary" />
                        <h3 className="font-semibold text-foreground">Documentación</h3>
                        <span className="text-xs text-muted-foreground">({docs.length})</span>
                      </div>
                      <p className="text-sm text-muted-foreground leading-relaxed">
                        {docs.length} archivo{docs.length !== 1 ? "s" : ""} de documentación y guías.
                      </p>
                    </div>
                  )}

                  {tests.length > 0 && (
                    <div>
                      <div className="flex items-center gap-2 mb-2">
                        <TestTube className="h-4 w-4 text-primary" />
                        <h3 className="font-semibold text-foreground">Tests</h3>
                        <span className="text-xs text-muted-foreground">({tests.length})</span>
                      </div>
                      <p className="text-sm text-muted-foreground leading-relaxed">
                        {tests.length} archivo{tests.length !== 1 ? "s" : ""} de pruebas automatizadas.
                      </p>
                    </div>
                  )}

                  {utilities.length > 0 && (
                    <div>
                      <div className="flex items-center gap-2 mb-2">
                        <Wrench className="h-4 w-4 text-primary" />
                        <h3 className="font-semibold text-foreground">Utilidades</h3>
                        <span className="text-xs text-muted-foreground">({utilities.length})</span>
                      </div>
                      <p className="text-sm text-muted-foreground leading-relaxed">
                        {utilities.length} utilidad{utilities.length !== 1 ? "es" : ""} y función{utilities.length !== 1 ? "es" : ""} auxiliar{utilities.length !== 1 ? "es" : ""}.
                      </p>
                    </div>
                  )}

                  {styles.length > 0 && (
                    <div>
                      <div className="flex items-center gap-2 mb-2">
                        <Palette className="h-4 w-4 text-primary" />
                        <h3 className="font-semibold text-foreground">Estilos</h3>
                        <span className="text-xs text-muted-foreground">({styles.length})</span>
                      </div>
                      <p className="text-sm text-muted-foreground leading-relaxed">
                        {styles.length} archivo{styles.length !== 1 ? "s" : ""} de estilos CSS/SCSS.
                      </p>
                    </div>
                  )}

                  {components.length === 0 &&
                    hooks.length === 0 &&
                    services.length === 0 &&
                    configs.length === 0 &&
                    docs.length === 0 &&
                    tests.length === 0 &&
                    utilities.length === 0 &&
                    styles.length === 0 && (
                      <div className="text-sm text-muted-foreground">
                        <p>No se detectaron módulos en este repositorio.</p>
                      </div>
                    )}
                </>
              ) : (
                <>
                  <div>
                    <h3 className="font-semibold mb-2 text-foreground">Módulo de Chat</h3>
                    <p className="text-sm text-muted-foreground leading-relaxed">
                      Maneja la interfaz conversacional y las consultas al repositorio.
                    </p>
                  </div>
                  <div>
                    <h3 className="font-semibold mb-2 text-foreground">Módulo de Contexto</h3>
                    <p className="text-sm text-muted-foreground leading-relaxed">
                      Gestiona los archivos utilizados para generar respuestas.
                    </p>
                  </div>
                  <div>
                    <h3 className="font-semibold mb-2 text-foreground">Módulo de Documentación</h3>
                    <p className="text-sm text-muted-foreground leading-relaxed">
                      Organiza y presenta la información del proyecto.
                    </p>
                  </div>
                  <div className="pt-2 border-t border-border">
                    <p className="text-xs text-muted-foreground italic">
                      Indexa un repositorio para ver sus módulos funcionales.
                    </p>
                  </div>
                </>
              )}
            </div>
          </TabsContent>

          <TabsContent value="flows" className="mt-0">
            <div className="space-y-4">
              <div>
                <h3 className="font-semibold mb-2 text-foreground">Flujo de Consulta</h3>
                <ol className="space-y-2 text-sm text-muted-foreground list-decimal list-inside">
                  <li>Usuario ingresa pregunta</li>
                  <li>Sistema analiza el contexto{hasIndex && " del repositorio indexado"}</li>
                  <li>Busca archivos relevantes{hasIndex && ` (${currentIndex?.summary.totalFiles || 0} disponibles)`}</li>
                  <li>Genera respuesta</li>
                  <li>Muestra archivos utilizados</li>
                </ol>
              </div>
              <div>
                <h3 className="font-semibold mb-2 text-foreground">Flujo de Navegación</h3>
                <ol className="space-y-2 text-sm text-muted-foreground list-decimal list-inside">
                  <li>Usuario explora sidebar</li>
                  <li>Selecciona sección</li>
                  <li>Visualiza documentación{hasIndex && " del repositorio"}</li>
                  <li>Puede hacer preguntas relacionadas</li>
                </ol>
              </div>
              {hasIndex && currentIndex && (
                <div>
                  <h3 className="font-semibold mb-2 text-foreground">Flujo de Indexación</h3>
                  <ol className="space-y-2 text-sm text-muted-foreground list-decimal list-inside">
                    <li>Repositorio indexado: {currentIndex.id}</li>
                    <li className="flex items-center gap-2">
                      <span>Rama:</span>
                      <Select
                        value={currentIndex.branch}
                        onValueChange={handleBranchChange}
                        disabled={loadingBranches || branches.length === 0}
                      >
                        <SelectTrigger className="h-7 w-auto min-w-[120px] text-xs gap-1">
                          <GitBranch className="h-3 w-3 shrink-0" />
                          <SelectValue placeholder="Cargando ramas..." />
                        </SelectTrigger>
                        <SelectContent>
                          {branches.map((branch) => (
                            <SelectItem key={branch} value={branch}>
                              <div className="flex items-center gap-2">
                                <GitBranch className="h-3 w-3" />
                                {branch}
                                {branch === currentIndex.branch && (
                                  <span className="text-xs text-muted-foreground">(actual)</span>
                                )}
                              </div>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </li>
                    <li>Última actualización: {new Date(currentIndex.indexedAt).toLocaleDateString()}</li>
                    <li>Estado: {currentIndex.status === "completed" ? "Completado" : "En proceso"}</li>
                  </ol>
                </div>
              )}
            </div>
          </TabsContent>
        </ScrollArea>
      </Tabs>
    </Card>
  )
}

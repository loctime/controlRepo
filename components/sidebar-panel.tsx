"use client"

import { useState, useEffect } from "react"
import { Card } from "@/components/ui/card"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { FileText, Map, GitBranch, Code2, Package, Settings, BookOpen, TestTube, Wrench, Palette, BarChart3 } from "lucide-react"
import { useRepository } from "@/lib/repository-context"
import { RepositoryMetrics as RepositoryMetricsView } from "@/components/repository-metrics"
import type { FileCategory } from "@/lib/types/repository"

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
  const { repositoryId, status, statusData } = useRepository()

  // Detectar si hay repositorio disponible (solo completed habilita el chat)
  // También verificar que statusData existe para mostrar contenido
  const hasRepository = status === "completed" && statusData?.stats

  // Obtener lenguajes principales (top 5)
  const topLanguages = hasRepository && statusData?.stats?.languages
    ? statusData.stats.languages.slice(0, 5)
    : []

  return (
    <Card className="h-full border-border py-0 gap-0 flex flex-col overflow-hidden">
      <Tabs defaultValue="architecture" className="h-full flex flex-col min-h-0">
        {/* Header fijo de tabs - NO scrollable */}
        <div className="border-b border-border px-3 pt-2 pb-2 shrink-0">
          <TabsList className="w-full grid grid-cols-4 gap-2">
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
            <TabsTrigger value="metrics" className="flex items-center gap-2">
              <BarChart3 className="h-4 w-4" />
              <span className="hidden md:inline">Métricas</span>
            </TabsTrigger>
          </TabsList>
        </div>

        {/* Contenido scrollable - solo el cuerpo */}
        <ScrollArea className="flex-1 min-h-0 p-3">
          <TabsContent value="architecture" className="mt-0">
            <div className="space-y-4">
              {hasRepository ? (
                <>
                  <div>
                    <h3 className="font-semibold mb-2 text-foreground">Resumen del Repositorio</h3>
                    <div className="space-y-2 text-sm text-muted-foreground">
                      <div className="flex justify-between">
                        <span>Archivos totales:</span>
                        <span className="font-medium text-foreground">{statusData?.stats?.totalFiles?.toLocaleString() ?? 0}</span>
                      </div>
                      {statusData?.stats?.totalSize && (
                        <div className="flex justify-between">
                          <span>Tamaño total:</span>
                          <span className="font-medium text-foreground">{(statusData.stats.totalSize / 1024).toFixed(2)} KB</span>
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
              {hasRepository ? (
                <div className="text-sm text-muted-foreground">
                  <p>La información detallada de módulos está disponible en el backend.</p>
                  <p className="mt-2">Usa el chat para consultar sobre la estructura del repositorio.</p>
                </div>
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
                  <li>Sistema analiza el contexto del repositorio indexado</li>
                  <li>Busca archivos relevantes{hasRepository && statusData?.stats?.totalFiles ? ` (${statusData.stats.totalFiles} disponibles)` : ""}</li>
                  <li>Genera respuesta</li>
                  <li>Muestra archivos utilizados</li>
                </ol>
              </div>
              <div>
                <h3 className="font-semibold mb-2 text-foreground">Flujo de Navegación</h3>
                <ol className="space-y-2 text-sm text-muted-foreground list-decimal list-inside">
                  <li>Usuario explora sidebar</li>
                  <li>Selecciona sección</li>
                  <li>Visualiza documentación del repositorio</li>
                  <li>Puede hacer preguntas relacionadas</li>
                </ol>
              </div>
              {hasRepository && repositoryId && (
                <div>
                  <h3 className="font-semibold mb-2 text-foreground">Flujo de Indexación</h3>
                  <ol className="space-y-2 text-sm text-muted-foreground list-decimal list-inside">
                    <li>Repositorio indexado: {repositoryId}</li>
                    {statusData?.indexedAt && (
                      <li>Última actualización: {new Date(statusData.indexedAt).toLocaleDateString()}</li>
                    )}
                    <li>Estado: Listo</li>
                  </ol>
                </div>
              )}
            </div>
          </TabsContent>

          <TabsContent value="metrics" className="mt-0">
            <RepositoryMetricsView />
          </TabsContent>
        </ScrollArea>
      </Tabs>
    </Card>
  )
}

"use client"
import { Card } from "@/components/ui/card"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { FileText, Map, GitBranch } from "lucide-react"

export function SidebarPanel() {
  return (
    <Card className="h-full border-border">
      <Tabs defaultValue="architecture" className="h-full flex flex-col">
        <div className="border-b border-border px-4 pt-4">
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

        <ScrollArea className="flex-1 p-4">
          <TabsContent value="architecture" className="mt-0">
            <div className="space-y-4">
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
            </div>
          </TabsContent>

          <TabsContent value="modules" className="mt-0">
            <div className="space-y-4">
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
            </div>
          </TabsContent>

          <TabsContent value="flows" className="mt-0">
            <div className="space-y-4">
              <div>
                <h3 className="font-semibold mb-2 text-foreground">Flujo de Consulta</h3>
                <ol className="space-y-2 text-sm text-muted-foreground list-decimal list-inside">
                  <li>Usuario ingresa pregunta</li>
                  <li>Sistema analiza el contexto</li>
                  <li>Busca archivos relevantes</li>
                  <li>Genera respuesta</li>
                  <li>Muestra archivos utilizados</li>
                </ol>
              </div>
              <div>
                <h3 className="font-semibold mb-2 text-foreground">Flujo de Navegación</h3>
                <ol className="space-y-2 text-sm text-muted-foreground list-decimal list-inside">
                  <li>Usuario explora sidebar</li>
                  <li>Selecciona sección</li>
                  <li>Visualiza documentación</li>
                  <li>Puede hacer preguntas relacionadas</li>
                </ol>
              </div>
            </div>
          </TabsContent>
        </ScrollArea>
      </Tabs>
    </Card>
  )
}

"use client"

import { useRepository } from "@/lib/repository-context"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { ChartContainer, ChartTooltip, ChartTooltipContent, ChartLegend, ChartLegendContent } from "@/components/ui/chart"
import { PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, ResponsiveContainer } from "recharts"
import { FileText, Code, Languages, Network, DoorOpen } from "lucide-react"

export function RepositoryMetrics() {
  const { currentMetrics, currentIndex } = useRepository()

  if (!currentMetrics || !currentIndex) {
    return (
      <div className="flex items-center justify-center p-8 text-muted-foreground">
        No hay métricas disponibles para este repositorio
      </div>
    )
  }

  // Preparar datos para gráfico de lenguajes (donut)
  const languageData = currentMetrics.languages.slice(0, 8).map((lang) => ({
    name: lang.ext || "Sin extensión",
    value: lang.lines,
    files: lang.files,
  }))

  // Preparar datos para gráfico de carpetas (barras)
  const folderData = currentMetrics.structure.folders.slice(0, 10).map((folder) => ({
    name: folder.path || "/",
    value: folder.lines,
    files: folder.files,
  }))

  // Colores para los gráficos
  const COLORS = [
    "hsl(var(--chart-1))",
    "hsl(var(--chart-2))",
    "hsl(var(--chart-3))",
    "hsl(var(--chart-4))",
    "hsl(var(--chart-5))",
  ]

  const languageConfig = {
    [languageData[0]?.name || "default"]: {
      label: languageData[0]?.name || "Lenguaje",
      color: COLORS[0],
    },
  }

  const folderConfig = {
    [folderData[0]?.name || "default"]: {
      label: folderData[0]?.name || "Carpeta",
      color: COLORS[0],
    },
  }

  // Top lenguajes principales
  const topLanguages = currentMetrics.languages.slice(0, 3)

  // Top archivos más importados
  const topImported = currentMetrics.relations.mostImported.slice(0, 5)

  return (
    <div className="space-y-4">
      {/* Cards de resumen */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Archivos totales</CardTitle>
            <FileText className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{currentMetrics.structure.totalFiles.toLocaleString()}</div>
            <CardDescription className="text-xs mt-1">
              {currentMetrics.structure.folders.length} carpetas
            </CardDescription>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Líneas totales</CardTitle>
            <Code className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{currentMetrics.structure.totalLines.toLocaleString()}</div>
            <CardDescription className="text-xs mt-1">
              Promedio: {Math.round(currentMetrics.structure.totalLines / currentMetrics.structure.totalFiles)} líneas/archivo
            </CardDescription>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Lenguajes principales</CardTitle>
            <Languages className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{topLanguages.length}</div>
            <CardDescription className="text-xs mt-1">
              {topLanguages.map((lang) => lang.ext).join(", ")}
            </CardDescription>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Entrypoints</CardTitle>
            <DoorOpen className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{currentMetrics.entrypoints.length}</div>
            <CardDescription className="text-xs mt-1">
              Puntos de entrada detectados
            </CardDescription>
          </CardContent>
        </Card>
      </div>

      {/* Gráfico de lenguajes (Donut) */}
      {languageData.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Distribución por Lenguaje</CardTitle>
            <CardDescription>Líneas de código por extensión de archivo</CardDescription>
          </CardHeader>
          <CardContent>
            <ChartContainer config={languageConfig} className="h-[300px]">
              <PieChart>
                <ChartTooltip
                  content={
                    <ChartTooltipContent
                      formatter={(value, name, item) => [
                        `${value?.toLocaleString()} líneas (${item.payload.files} archivos)`,
                        name,
                      ]}
                    />
                  }
                />
                <ChartLegend content={<ChartLegendContent />} />
                <Pie
                  data={languageData}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  outerRadius={80}
                  innerRadius={40}
                  label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`}
                >
                  {languageData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
              </PieChart>
            </ChartContainer>
          </CardContent>
        </Card>
      )}

      {/* Gráfico de carpetas (Barras) */}
      {folderData.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Top Carpetas por Líneas</CardTitle>
            <CardDescription>Las 10 carpetas con más líneas de código</CardDescription>
          </CardHeader>
          <CardContent>
            <ChartContainer config={folderConfig} className="h-[300px]">
              <BarChart data={folderData}>
                <XAxis
                  dataKey="name"
                  angle={-45}
                  textAnchor="end"
                  height={100}
                  tick={{ fontSize: 12 }}
                />
                <YAxis tick={{ fontSize: 12 }} />
                <ChartTooltip
                  content={
                    <ChartTooltipContent
                      formatter={(value, name, item) => [
                        `${value?.toLocaleString()} líneas (${item.payload.files} archivos)`,
                        "Líneas",
                      ]}
                    />
                  }
                />
                <Bar dataKey="value" fill={COLORS[0]} radius={[4, 4, 0, 0]} />
              </BarChart>
            </ChartContainer>
          </CardContent>
        </Card>
      )}

      {/* Archivos centrales */}
      {topImported.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Archivos Centrales</CardTitle>
            <CardDescription>Archivos más importados por otros archivos</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {topImported.map((file, index) => (
                <div key={file.path} className="flex items-center justify-between p-2 rounded-md bg-muted/50">
                  <div className="flex items-center gap-2">
                    <Network className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm font-mono">{file.path}</span>
                  </div>
                  <span className="text-sm text-muted-foreground">
                    Importado por {file.importedByCount} archivos
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Entrypoints */}
      {currentMetrics.entrypoints.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Entrypoints</CardTitle>
            <CardDescription>Puntos de entrada detectados en el repositorio</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {currentMetrics.entrypoints.map((entrypoint, index) => (
                <div key={entrypoint.path} className="flex items-center justify-between p-2 rounded-md bg-muted/50">
                  <div className="flex items-center gap-2">
                    <DoorOpen className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm font-mono">{entrypoint.path}</span>
                  </div>
                  <span className="text-xs px-2 py-1 rounded-md bg-primary/10 text-primary">
                    {entrypoint.reason === "filename" ? "Nombre" : entrypoint.reason === "location" ? "Ubicación" : "Config"}
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}

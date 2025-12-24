"use client"

import { useEffect, useState } from "react"
import { useRepository } from "@/lib/repository-context"
import { RepositoryMetrics } from "@/lib/types/repository-metrics"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart"
import { PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis } from "recharts"
import { FileText, Code, GitBranch, TrendingUp, Folder, Star } from "lucide-react"

// Colores para los gráficos
const CHART_COLORS = [
  "hsl(var(--chart-1))",
  "hsl(var(--chart-2))",
  "hsl(var(--chart-3))",
  "hsl(var(--chart-4))",
  "hsl(var(--chart-5))",
]

export function RepositoryMetrics() {
  const { currentIndex } = useRepository()
  const [metrics, setMetrics] = useState<RepositoryMetrics | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!currentIndex) {
      setLoading(false)
      return
    }

    const fetchMetrics = async () => {
      try {
        setLoading(true)
        setError(null)
        const response = await fetch(
          `/api/repository/metrics?owner=${encodeURIComponent(currentIndex.owner)}&repo=${encodeURIComponent(currentIndex.repo)}&branch=${encodeURIComponent(currentIndex.branch)}`
        )

        if (!response.ok) {
          if (response.status === 404) {
            setError("No se encontraron métricas para este repositorio")
          } else {
            throw new Error(`Error al obtener métricas: ${response.statusText}`)
          }
          return
        }

        const data = await response.json()
        setMetrics(data)
      } catch (err) {
        setError(err instanceof Error ? err.message : "Error desconocido")
      } finally {
        setLoading(false)
      }
    }

    fetchMetrics()
  }, [currentIndex])

  if (!currentIndex) {
    return (
      <div className="text-sm text-muted-foreground">
        <p>Indexa un repositorio para ver sus métricas.</p>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="text-sm text-muted-foreground">
        <p>Cargando métricas...</p>
      </div>
    )
  }

  if (error || !metrics) {
    return (
      <div className="text-sm text-muted-foreground">
        <p>{error || "No se encontraron métricas para este repositorio."}</p>
      </div>
    )
  }

  // Preparar datos para gráfico donut de lenguajes
  const languageData = metrics.languages
    .sort((a, b) => b.lines - a.lines)
    .slice(0, 5)
    .map((lang, index) => ({
      name: lang.ext || "Sin extensión",
      value: lang.lines,
      files: lang.files,
      fill: CHART_COLORS[index % CHART_COLORS.length],
    }))

  // Preparar datos para gráfico de barras de carpetas
  const folderData = metrics.structure.folders
    .sort((a, b) => b.lines - a.lines)
    .slice(0, 10)
    .map((folder) => ({
      name: folder.path.split("/").filter(Boolean).pop() || folder.path,
      path: folder.path,
      lines: folder.lines,
      files: folder.files,
    }))

  // Top lenguajes principales (top 3)
  const topLanguages = metrics.languages
    .sort((a, b) => b.lines - a.lines)
    .slice(0, 3)

  // Archivos centrales (mostImported, top 5)
  const centralFiles = metrics.relations.mostImported.slice(0, 5)

  // Configuración del gráfico
  const chartConfig = {
    languages: {
      label: "Líneas de código",
    },
    folders: {
      label: "Líneas de código",
    },
  }

  return (
    <div className="space-y-4">
      {/* Cards de resumen */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Archivos Totales</CardTitle>
            <FileText className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{metrics.structure.totalFiles.toLocaleString()}</div>
            <CardDescription className="text-xs">Archivos indexados</CardDescription>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Líneas Totales</CardTitle>
            <Code className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{metrics.structure.totalLines.toLocaleString()}</div>
            <CardDescription className="text-xs">Líneas de código</CardDescription>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Lenguajes Principales</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{topLanguages.length}</div>
            <CardDescription className="text-xs">
              {topLanguages.map((lang) => lang.ext).join(", ")}
            </CardDescription>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Archivos Centrales</CardTitle>
            <Star className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{centralFiles.length}</div>
            <CardDescription className="text-xs">Más importados</CardDescription>
          </CardContent>
        </Card>
      </div>

      {/* Gráfico Donut por Lenguaje */}
      {languageData.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Distribución por Lenguaje</CardTitle>
            <CardDescription>Líneas de código por extensión de archivo</CardDescription>
          </CardHeader>
          <CardContent>
            <ChartContainer config={chartConfig} className="h-[300px]">
              <PieChart>
                <ChartTooltip
                  content={({ active, payload }) => {
                    if (active && payload && payload.length) {
                      const data = payload[0].payload
                      return (
                        <ChartTooltipContent>
                          <div className="flex flex-col gap-2">
                            <div className="font-medium">{data.name}</div>
                            <div className="text-sm text-muted-foreground">
                              {data.value.toLocaleString()} líneas
                            </div>
                            <div className="text-sm text-muted-foreground">
                              {data.files} archivo{data.files !== 1 ? "s" : ""}
                            </div>
                          </div>
                        </ChartTooltipContent>
                      )
                    }
                    return null
                  }}
                />
                <Pie
                  data={languageData}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`}
                  outerRadius={80}
                  innerRadius={50}
                  fill="#8884d8"
                  dataKey="value"
                >
                  {languageData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.fill} />
                  ))}
                </Pie>
              </PieChart>
            </ChartContainer>
          </CardContent>
        </Card>
      )}

      {/* Gráfico de Barras por Carpeta */}
      {folderData.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Top Carpetas por Líneas</CardTitle>
            <CardDescription>Top 10 carpetas con más líneas de código</CardDescription>
          </CardHeader>
          <CardContent>
            <ChartContainer config={chartConfig} className="h-[300px]">
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
                  content={({ active, payload }) => {
                    if (active && payload && payload.length) {
                      const data = payload[0].payload
                      return (
                        <ChartTooltipContent>
                          <div className="flex flex-col gap-2">
                            <div className="font-medium">{data.path}</div>
                            <div className="text-sm text-muted-foreground">
                              {data.lines.toLocaleString()} líneas
                            </div>
                            <div className="text-sm text-muted-foreground">
                              {data.files} archivo{data.files !== 1 ? "s" : ""}
                            </div>
                          </div>
                        </ChartTooltipContent>
                      )
                    }
                    return null
                  }}
                />
                <Bar dataKey="lines" fill={CHART_COLORS[0]} radius={[4, 4, 0, 0]} />
              </BarChart>
            </ChartContainer>
          </CardContent>
        </Card>
      )}

      {/* Archivos Centrales */}
      {centralFiles.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Archivos Centrales</CardTitle>
            <CardDescription>Archivos más importados por otros archivos</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {centralFiles.map((file, index) => (
                <div
                  key={file.path}
                  className="flex items-center justify-between rounded-md border p-2 text-sm"
                >
                  <div className="flex items-center gap-2">
                    <span className="text-muted-foreground">#{index + 1}</span>
                    <code className="text-xs">{file.path}</code>
                  </div>
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <GitBranch className="h-3 w-3" />
                    <span>{file.importedByCount} importaciones</span>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Entrypoints */}
      {metrics.entrypoints.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Entrypoints</CardTitle>
            <CardDescription>Puntos de entrada detectados en el repositorio</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {metrics.entrypoints.map((entrypoint) => (
                <div
                  key={entrypoint.path}
                  className="flex items-center justify-between rounded-md border p-2 text-sm"
                >
                  <code className="text-xs">{entrypoint.path}</code>
                  <span className="text-xs text-muted-foreground capitalize">
                    {entrypoint.reason === "filename" && "Nombre de archivo"}
                    {entrypoint.reason === "location" && "Ubicación"}
                    {entrypoint.reason === "config" && "Configuración"}
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


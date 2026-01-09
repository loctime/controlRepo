"use client"

import { useEffect, Suspense } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { Button } from "@/components/ui/button"
import { AlertCircle, CheckCircle2, Loader2 } from "lucide-react"

function GitHubConnectedContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  
  useEffect(() => {
    const success = searchParams?.get("success")
    const error = searchParams?.get("error")
    const reason = searchParams?.get("reason")

    // Redirigir a home con parámetros para que el hook los procese
    if (success === "true" || success === "1") {
      console.log("[GitHubConnected] OAuth exitoso, redirigiendo a home con parámetros...")
      router.replace("/?success=true")
    } else if (error) {
      console.error("[GitHubConnected] OAuth falló:", { error, reason })
      router.replace(`/?error=${encodeURIComponent(error)}${reason ? `&reason=${encodeURIComponent(reason)}` : ""}`)
    } else {
      // Si no hay parámetros, asumir éxito (compatibilidad hacia atrás)
      console.log("[GitHubConnected] Sin parámetros, asumiendo éxito...")
      router.replace("/?success=true")
    }
  }, [searchParams, router])

  const success = searchParams?.get("success")
  const error = searchParams?.get("error")
  const reason = searchParams?.get("reason")

  if (success === "true" || success === "1") {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-center space-y-4">
          <CheckCircle2 className="h-16 w-16 text-green-500 mx-auto" />
          <h1 className="text-2xl font-semibold">
            GitHub conectado correctamente
          </h1>
          <p className="text-muted-foreground">
            Ya podés indexar repositorios.
          </p>
          <div className="flex items-center gap-2 justify-center">
            <Loader2 className="h-4 w-4 animate-spin" />
            <p className="text-sm text-muted-foreground">Redirigiendo...</p>
          </div>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-center space-y-4 max-w-md">
          <AlertCircle className="h-16 w-16 text-destructive mx-auto" />
          <h1 className="text-2xl font-semibold">
            Error al conectar GitHub
          </h1>
          <p className="text-muted-foreground">
            {reason || error || "Ocurrió un error durante la conexión"}
          </p>
          <Button
            onClick={() => router.replace("/")}
            variant="outline"
          >
            Volver
          </Button>
        </div>
      </div>
    )
  }

  // Estado de carga mientras se procesa
  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="text-center space-y-4">
        <Loader2 className="h-16 w-16 animate-spin mx-auto text-muted-foreground" />
        <p className="text-muted-foreground">Procesando conexión...</p>
      </div>
    </div>
  )
}

export default function GitHubConnectedPage() {
  return (
    <Suspense fallback={
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-16 w-16 animate-spin text-muted-foreground" />
      </div>
    }>
      <GitHubConnectedContent />
    </Suspense>
  )
}
  
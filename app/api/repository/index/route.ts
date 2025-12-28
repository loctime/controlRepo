import { NextRequest, NextResponse } from "next/server"
import { indexRepository } from "@/lib/repository/indexer"
import { saveRepositoryIndex, acquireIndexLock, releaseIndexLock, getRepositoryIndex } from "@/lib/repository/storage"
import { IndexResponse, RepositoryIndex } from "@/lib/types/repository"
import { getRepositoryMetadata, resolveRepositoryBranch } from "@/lib/github/client"
import { generateMinimalProjectBrain } from "@/lib/project-brain/generator"
import { saveProjectBrain, hasProjectBrain } from "@/lib/project-brain/storage-filesystem"
import { createRepositoryId } from "@/lib/repository/utils"
import { generateMetrics } from "@/lib/repository/metrics/generator"
import { saveMetrics } from "@/lib/repository/metrics/storage-filesystem"
import { getAuthenticatedUserId, getGitHubAccessToken } from "@/lib/auth/server-auth"

/**
 * POST /api/repository/index
 * Indexa un repositorio completo
 * 
 * LOGS EN PRODUCCIÓN:
 * - Los logs con console.log/console.error aparecen en los logs del servidor, NO en la consola del navegador
 * - En Vercel: Dashboard > Tu proyecto > Functions > Logs
 * - Los logs estructurados (JSON.stringify) facilitan el filtrado y búsqueda
 * - Los logs con prefijo [INDEX] y [AUTH] ayudan a identificar el origen
 * - Los errores incluyen errorType para facilitar el debugging
 */
export async function POST(request: NextRequest) {
  // Log inmediato para confirmar que el endpoint se ejecuta
  console.log("🔥🔥🔥 [INDEX] POST /api/repository/index EJECUTÁNDOSE 🔥🔥🔥")
  console.log("[INDEX] ===== Inicio de indexación =====")
  console.log(JSON.stringify({
    level: "info",
    service: "controlfile-backend",
    environment: process.env.NODE_ENV || "production",
    timestamp: new Date().toISOString(),
    path: "/api/repository/index",
    method: "POST",
    message: "Inicio de indexación",
  }))
  try {
    // A) Autenticación: Verificar token Firebase y obtener UID
    let uid: string
    try {
      console.log("[INDEX] Verificando autenticación...")
      uid = await getAuthenticatedUserId(request)
      console.log(`[INDEX] Usuario autenticado: ${uid}`)
    } catch (error) {
      console.error("[INDEX] Error de autenticación:", error)
      return NextResponse.json(
        { error: error instanceof Error ? error.message : "No autorizado" },
        { status: 401 }
      )
    }

    // B) Obtener access_token de GitHub del usuario desde Firestore
    console.log(`[INDEX] Obteniendo access_token de GitHub para usuario ${uid}...`)
    const accessToken = await getGitHubAccessToken(uid)
    if (!accessToken) {
      console.error(`[INDEX] GitHub no conectado para usuario ${uid}`)
      return NextResponse.json(
        { error: "GitHub no conectado. Por favor, conecta tu cuenta de GitHub primero." },
        { status: 400 }
      )
    }
    console.log(`[INDEX] Access_token de GitHub obtenido para usuario ${uid}`)

    const body = await request.json()
    const { owner, repo, branch } = body
    console.log(`[INDEX] Parámetros recibidos: owner=${owner}, repo=${repo}, branch=${branch || "main"}`)

    // Validar parámetros
    if (!owner || !repo) {
      return NextResponse.json(
        { error: "owner y repo son requeridos" },
        { status: 400 }
      )
    }

    // Resolver rama primero para crear repositoryId con branch
    let resolvedBranch: { branch: string; lastCommit: string }
    let repoMetadata

    try {
      repoMetadata = await getRepositoryMetadata(owner, repo, accessToken)
      resolvedBranch = await resolveRepositoryBranch(owner, repo, accessToken, branch)
    } catch (error) {
      console.error(`[INDEX] Error resolving branch for ${owner}/${repo}:`, error)
      return NextResponse.json(
        { error: `Error al resolver rama del repositorio: ${error instanceof Error ? error.message : "Error desconocido"}` },
        { status: 400 }
      )
    }

    const finalBranch = resolvedBranch.branch
    const repositoryId = createRepositoryId(owner, repo, finalBranch)

    // Intentar adquirir lock
    console.log(`[INDEX] Intentando adquirir lock para ${repositoryId}...`)
    const lockAcquired = await acquireIndexLock(repositoryId, "system")
    if (!lockAcquired) {
      console.log(`[INDEX] Lock no adquirido para ${repositoryId} (ya está siendo indexado)`)
      return NextResponse.json<IndexResponse>(
        {
          status: "error",
          repositoryId,
          error: "El repositorio ya está siendo indexado",
        },
        { status: 409 }
      )
    }
    console.log(`[INDEX] Lock adquirido para ${repositoryId}`)

    let indexPromiseStarted = false
    try {
      const lastCommit = resolvedBranch.lastCommit
      const defaultBranch = repoMetadata.default_branch

      // Crear índice inicial con status "indexing"
      const initialIndex: RepositoryIndex = {
        id: repositoryId,
        owner,
        repo,
        branch: finalBranch,
        defaultBranch,
        status: "indexing",
        indexedAt: new Date().toISOString(),
        lastCommit,
        metadata: {
          description: repoMetadata.description || undefined,
          language: repoMetadata.language || undefined,
          stars: repoMetadata.stargazers_count,
          forks: repoMetadata.forks_count,
          topics: repoMetadata.topics,
          createdAt: repoMetadata.created_at,
          updatedAt: repoMetadata.updated_at,
        },
        files: [],
        keyFiles: {},
        summary: {
          totalFiles: 0,
          totalLines: 0,
          languages: {},
          categories: {
            component: 0,
            hook: 0,
            service: 0,
            config: 0,
            docs: 0,
            test: 0,
            utility: 0,
            style: 0,
            other: 0,
          },
          structure: {
            components: 0,
            hooks: 0,
            services: 0,
            configs: 0,
            docs: 0,
            tests: 0,
          },
        },
      }

      // Persistir índice inicial inmediatamente
      await saveRepositoryIndex(initialIndex)
      console.log(`[INDEX] Created initial index for ${repositoryId}`)

      // Iniciar indexación de forma asíncrona
      // En producción, esto debería ejecutarse en un worker/queue
      console.log(`[INDEX] Indexing started for ${repositoryId}`)
      
      // Proteger contra errores sincrónicos al llamar indexRepository
      let indexPromise: Promise<any>
      try {
        indexPromise = indexRepository(owner, repo, accessToken, finalBranch)
        indexPromiseStarted = true
        console.log(`[INDEX] Promesa de indexación iniciada para ${repositoryId}`)
      } catch (syncError) {
        console.error(`[INDEX] Error sincrónico al iniciar indexación para ${repositoryId}:`, syncError)
        // Liberar lock antes de lanzar el error
        try {
          await releaseIndexLock(repositoryId)
          console.log(`[INDEX] Lock liberado después de error sincrónico para ${repositoryId}`)
        } catch (lockError) {
          console.error(`[INDEX] Error al liberar lock después de error sincrónico para ${repositoryId}:`, lockError)
        }
        throw syncError
      }

      // Manejar la promesa de indexación de forma asíncrona
      indexPromise
        .then(async (updatedIndex) => {
          try {
            // Actualizar índice con los archivos procesados
            updatedIndex.status = "completed"
            await saveRepositoryIndex(updatedIndex)
            console.log(`[INDEX] Indexing completed for ${repositoryId} (${updatedIndex.files.length} files)`)
            
            // Crear o obtener Project Brain
            const brainExists = await hasProjectBrain(repositoryId)
            let projectBrain = undefined
            if (!brainExists) {
              projectBrain = generateMinimalProjectBrain(updatedIndex)
              await saveProjectBrain(projectBrain)
              console.log(`[INDEX] Project Brain created for ${repositoryId}`)
            } else {
              // Obtener Project Brain existente para pasarlo a generateMetrics
              const { getProjectBrain } = await import("@/lib/project-brain/storage-filesystem")
              projectBrain = await getProjectBrain(repositoryId) || undefined
            }
            
            // Generar y guardar métricas
            const metrics = generateMetrics(updatedIndex, projectBrain)
            await saveMetrics(repositoryId, metrics)
            console.log(`[INDEX] Metrics generated for ${repositoryId}`)
          } catch (error) {
            console.error(`[INDEX] Error en el procesamiento post-indexación para ${repositoryId}:`, error)
          } finally {
            // Liberar lock siempre, incluso si hay errores
            try {
              await releaseIndexLock(repositoryId)
              console.log(`[INDEX] Lock liberado después de completar indexación para ${repositoryId}`)
            } catch (lockError) {
              console.error(`[INDEX] Error al liberar lock después de completar indexación para ${repositoryId}:`, lockError)
            }
          }
        })
        .catch(async (error) => {
          console.error(`[INDEX] Error indexing ${repositoryId}:`, error)
          try {
            // Actualizar índice con estado de error
            const existingIndex = await getRepositoryIndex(repositoryId)
            if (existingIndex) {
              existingIndex.status = "error"
              await saveRepositoryIndex(existingIndex)
            }
          } catch (updateError) {
            console.error(`[INDEX] Error al actualizar índice con estado de error para ${repositoryId}:`, updateError)
          } finally {
            // Liberar lock en caso de error
            try {
              await releaseIndexLock(repositoryId)
              console.log(`[INDEX] Lock liberado después de error en indexación para ${repositoryId}`)
            } catch (lockError) {
              console.error(`[INDEX] Error al liberar lock después de error en indexación para ${repositoryId}:`, lockError)
            }
          }
        })

      // Retornar inmediatamente (indexación en background)
      // El lock será liberado por la promesa asíncrona (then/catch)
      return NextResponse.json<IndexResponse>(
        {
          status: "indexing",
          repositoryId,
          message: "Indexación iniciada",
        },
        { status: 202 }
      )
    } catch (error) {
      console.error(`[INDEX] Error en el bloque try principal para ${repositoryId}:`, error)
      // Liberar lock solo si la promesa no se inició (error antes de iniciar indexRepository)
      if (!indexPromiseStarted) {
        try {
          await releaseIndexLock(repositoryId)
          console.log(`[INDEX] Lock liberado en catch principal (promesa no iniciada) para ${repositoryId}`)
        } catch (lockError) {
          console.error(`[INDEX] Error al liberar lock en catch principal para ${repositoryId}:`, lockError)
        }
      } else {
        console.log(`[INDEX] Lock NO liberado en catch principal porque la promesa ya se inició para ${repositoryId}`)
      }
      throw error
    }
  } catch (error) {
    console.error("[INDEX] ===== Error en POST /api/repository/index =====")
    console.error("[INDEX] Error:", error)
    console.error("[INDEX] Stack:", error instanceof Error ? error.stack : "No stack disponible")
    
    // Determinar el tipo de error para ayudar con el debugging
    let errorType = "UNKNOWN_ERROR"
    let errorMessage = error instanceof Error ? error.message : "Error desconocido"
    
    if (errorMessage.includes("FIREBASE_SERVICE_ACCOUNT_KEY") || errorMessage.includes("Firebase Admin")) {
      errorType = "FIREBASE_INIT_ERROR"
    } else if (errorMessage.includes("Token inválido") || errorMessage.includes("Authorization")) {
      errorType = "AUTH_ERROR"
    } else if (errorMessage.includes("GitHub")) {
      errorType = "GITHUB_ERROR"
    } else if (errorMessage.includes("lock") || errorMessage.includes("Lock")) {
      errorType = "LOCK_ERROR"
    }
    
    // Log estructurado para producción (aparece en logs del servidor)
    console.error(JSON.stringify({
      level: "error",
      service: "controlfile-backend",
      environment: process.env.NODE_ENV || "production",
      timestamp: new Date().toISOString(),
      path: "/api/repository/index",
      method: "POST",
      errorType,
      errorMessage: errorMessage.substring(0, 200), // Limitar longitud
      hasStack: error instanceof Error && !!error.stack,
    }))
    
    return NextResponse.json(
      {
        error: errorMessage,
        errorType, // Incluir tipo de error para debugging
      },
      { status: 500 }
    )
  }
}


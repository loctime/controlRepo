CONTRATO FINAL DE LA API

ControlFile – Repository Chat API
Versión: v1 (estable)
Principio: Backend = única fuente de verdad · Frontend pasivo

🔑 Conceptos base

El backend decide estado, disponibilidad y respuestas

El frontend no conoce índices ni estructuras internas

El frontend solo consume estado y resultados

Nunca hay 404 ambiguos

1️⃣ POST /repositories/index

Inicia la indexación de un repositorio o retorna su estado actual.

Request
{
  "repositoryId": "github:owner:repo",
  "accessToken": "optional_github_token",
  "force": false
}


accessToken es opcional (solo repos privados)

force=true fuerza reindexación

Response — 200
{
  "repositoryId": "github:owner:repo",
  "status": "indexing" | "ready",
  "message": "Indexación iniciada" | "Repositorio ya indexado"
}


📌 Nunca bloquea
📌 No borra otros repos
📌 Es idempotente

2️⃣ GET /repositories/{repositoryId}/status

Obtiene el estado real del repositorio.

Response — 200 (SIEMPRE)
{
  "repositoryId": "github:owner:repo",
  "status": "idle" | "indexing" | "ready" | "error",
  "indexedAt": "2026-01-08T22:03:19Z",
  "stats": {
    "totalFiles": 113,
    "totalSize": 1048576,
    "languages": ["TypeScript", "JavaScript"]
  },
  "error": null
}

Reglas

Si el repo no existe → status: "idle"

Nunca devuelve 404

stats solo existe si está ready

3️⃣ POST /chat/query

Envía una pregunta sobre un repositorio.

Request
{
  "repositoryId": "github:owner:repo",
  "question": "¿Dónde se define la autenticación?",
  "conversationId": "optional"
}

Response — 200 (repo listo)
{
  "response": "La autenticación se define en src/auth.ts...",
  "conversationId": "conv-123",
  "sources": [
    {
      "path": "src/auth.ts",
      "lines": [10, 42]
    }
  ]
}

Response — 202 (indexando)
{
  "status": "indexing",
  "message": "El repositorio se está indexando"
}

Response — 400 (idle o error)
{
  "status": "idle",
  "message": "El repositorio no está listo para chat"
}

🚫 Garantías de seguridad

El backend NUNCA envía al frontend:

Árbol completo del repo

Contenido de archivos

Índices

Embeddings

Rutas reales de filesystem

Metadata interna

✅ Lo que el frontend puede asumir

El backend siempre dice la verdad

Si status === ready → se puede chatear

Si status !== ready → mostrar UX correspondiente

No hay estados ocultos
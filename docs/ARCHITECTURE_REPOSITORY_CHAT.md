# Arquitectura del Sistema de Chat por Repositorio

## Visión General

### Qué hace el sistema

El sistema permite a los usuarios **consultar conversacionalmente** sus repositorios de GitHub mediante un asistente de IA. Los usuarios pueden:

1. **Indexar repositorios** de GitHub (públicos o privados)
2. **Consultar el código** mediante preguntas en lenguaje natural
3. **Recibir respuestas contextualizadas** basadas en el código real del repositorio
4. **Ver los archivos usados** como contexto en cada respuesta

### Para qué sirve

- **Onboarding rápido** a repositorios grandes o complejos
- **Documentación automática** basada en el código real
- **Exploración arquitectónica** guiada por preguntas
- **Análisis de código** sin necesidad de navegar manualmente el repositorio
- **Consultas técnicas** sobre implementaciones, patrones y decisiones

## Principios de Arquitectura

### 1. Backend como única fuente de verdad

El backend (ControlFile) es la **única autoridad** sobre:
- Estado de indexación de repositorios
- Disponibilidad de repositorios para chat
- Validación de parámetros y requests
- Generación de respuestas

**Consecuencias:**
- El frontend nunca infiere estados
- El frontend confía ciegamente en las respuestas del backend
- No hay lógica de negocio duplicada entre frontend y backend

### 2. Frontend pasivo

El frontend (ControlRepo) es **completamente pasivo**:
- No maneja índices ni estructuras internas
- No accede directamente al filesystem
- No procesa código ni genera respuestas
- Solo consume estado y resultados del backend

**Qué hace el frontend:**
- Renderiza la UI
- Envía requests al backend
- Muestra el estado recibido del backend
- Implementa polling para actualizar estados

**Qué NO hace el frontend:**
- Validar si un repositorio puede ser indexado
- Inferir si un repositorio está listo para chat
- Almacenar índices o metadata del repositorio
- Generar respuestas de chat

### 3. Contrato API explícito (API v1)

Todas las interacciones entre frontend y backend siguen un **contrato estricto** definido en `docs/CONTRATO-API.md`:

- Tipos de request/response claramente definidos
- Estados explícitos (`idle`, `indexing`, `ready`, `error`)
- Códigos HTTP consistentes
- Formato de `repositoryId`: `github:owner:repo`

**Garantías del contrato:**
- Nunca hay 404 ambiguos (siempre devuelve 200 con `status: "idle"` si no existe)
- El backend nunca envía contenido crudo de archivos al frontend
- El frontend puede asumir que el backend siempre dice la verdad

## Flujo Completo

### 1. Selección de Repositorio

El usuario selecciona un repositorio de GitHub mediante:

**Opción A: URL manual**
```
Usuario ingresa: https://github.com/owner/repo
Frontend parsea: github:owner:repo
Frontend llama: indexRepository("github:owner:repo")
```

**Opción B: Selector de GitHub**
```
Usuario selecciona repo desde lista de repos de GitHub
Frontend extrae: owner y repo
Frontend construye: github:owner:repo
Frontend llama: indexRepository("github:owner:repo")
```

**Validación en frontend:**
- Formato correcto: `github:owner:repo`
- No vacío
- Validación adicional la hace el backend

### 2. Indexación (POST /repositories/index)

**Flujo:**

```
Frontend (ControlRepo/Vercel)
  ↓
  POST /api/repositories/index
  Body: { repositoryId: "github:owner:repo", force: false }
  ↓
Proxy en ControlRepo
  ↓
  POST /api/repository/index
  Body: { repositoryId: "github:owner:repo", force: false }
  ↓
Backend ControlFile (Render)
  ↓
  1. Autentica usuario (Firebase token)
  2. Obtiene GitHub accessToken desde Firestore
  3. Parsea repositoryId → extrae owner, repo
  4. Valida que el repositorio existe
  5. Adquiere lock (si no está indexando)
  6. Inicia indexación en background
  7. Retorna 200 con { status: "indexing" | "ready" }
```

**Características:**
- **No bloquea**: Retorna inmediatamente, indexación en background
- **Idempotente**: Llamar múltiples veces es seguro
- **No destructivo**: No borra otros repositorios
- **Con lock**: Previene indexaciones simultáneas del mismo repo

**Endpoints involucrados:**

**Frontend → Proxy:**
```
POST /api/repositories/index
Headers: { Authorization: "Bearer <firebase-token>" }
Body: { repositoryId: "github:owner:repo", force?: boolean }
```

**Proxy → Backend:**
```
POST /api/repository/index (en ControlFile)
Headers: { Content-Type: "application/json" }
Body: { owner: "owner", repo: "repo", branch: "main", accessToken: "...", uid: "..." }
```

### 3. Polling de Estado (GET /repositories/{id}/status)

**Flujo:**

```
Frontend (ControlRepo)
  ↓
  GET /api/repositories/github:owner:repo/status
  (cada 4 segundos si status === "indexing")
  ↓
Proxy en ControlRepo
  ↓
  GET /api/repository/status?repositoryId=github:owner:repo
  ↓
Backend ControlFile (Render)
  ↓
  1. Lee índice desde filesystem: .repository-indexes/{repositoryId}.json
  2. Si no existe → retorna { status: "idle", repositoryId, error: null }
  3. Si existe → retorna { status: "ready" | "indexing", stats, indexedAt }
  4. Siempre retorna 200 (nunca 404)
```

**Lógica de polling:**

```typescript
// En repository-context.tsx
if (status === "indexing") {
  // Iniciar polling cada 4 segundos
  startPolling(repositoryId)
}

// Cuando status === "ready" || status === "error"
// Detener polling automáticamente
```

**Estado de polling:**
- Se inicia automáticamente cuando `status === "indexing"`
- Se detiene cuando `status === "ready"` o `status === "error"`
- Se ejecuta cada 4 segundos (POLLING_INTERVAL)
- Se limpia al desmontar el componente

**Respuesta del backend:**

```typescript
{
  repositoryId: "github:owner:repo",
  status: "idle" | "indexing" | "ready" | "error",
  indexedAt?: "2026-01-08T22:03:19Z",  // Solo si ready
  stats?: {                             // Solo si ready
    totalFiles: 113,
    totalSize: 1048576,
    languages: ["TypeScript", "JavaScript"]
  },
  error: null | string                  // Solo si error
}
```

**Reglas importantes:**
- **Siempre retorna 200**: Nunca 404
- **Si no existe**: `status: "idle"`
- **stats solo existe** si `status === "ready"`
- **El frontend nunca infiere estados**: Confía en la respuesta del backend

### 4. Chat (POST /chat/query)

**Flujo:**

```
Frontend (ControlRepo)
  ↓
  POST /api/chat/query
  Body: { repositoryId: "github:owner:repo", question: "¿Dónde se define la autenticación?" }
  ↓
Backend ControlRepo (proxy/enrutamiento)
  ↓
  POST /api/chat/query (mismo backend, procesamiento interno)
  ↓
Backend ControlFile (si aplica, o mismo backend)
  ↓
  1. Valida que repositoryId existe y está ready
  2. Si status !== "ready" → retorna 202 o 400 según corresponda
  3. Si status === "ready":
     a. Analiza la pregunta (intención, entidades)
     b. Selecciona archivos relevantes desde el índice
     c. Carga Project Brain del repositorio
     d. Carga métricas del repositorio (opcional)
     e. Genera respuesta usando LLM (Ollama phi-3)
     f. Retorna respuesta con sources
```

**Validaciones del backend:**

```typescript
// Si el repositorio no está indexado
if (!index || index.status !== "completed") {
  return { status: "idle", message: "El repositorio no está listo para chat" }
}

// Si está indexando
if (index.status === "indexing") {
  return { status: "indexing", message: "El repositorio se está indexando" }
}

// Si hay error
if (index.status === "error") {
  return { status: "error", message: "El repositorio tiene un error" }
}
```

**Respuestas posibles:**

**200 OK (Success):**
```json
{
  "response": "La autenticación se define en src/auth.ts...",
  "conversationId": "conv-123",
  "sources": [
    { "path": "src/auth.ts", "lines": [10, 42] }
  ]
}
```

**202 Accepted (Indexing):**
```json
{
  "status": "indexing",
  "message": "El repositorio se está indexando"
}
```

**400 Bad Request (Not Ready):**
```json
{
  "status": "idle" | "error",
  "message": "El repositorio no está listo para chat"
}
```

**Procesamiento interno del chat:**

1. **Análisis de pregunta** (`step1-question-analysis.ts`)
   - Extrae intención, entidades, señales
   - Normaliza la pregunta

2. **Selección de fuentes JSON** (`step2-select-json-sources.ts`)
   - Determina qué archivos JSON cargar (package.json, tsconfig.json, etc.)

3. **Carga y filtrado de JSON** (`step3-load-and-filter-json.ts`)
   - Carga archivos JSON relevantes
   - Filtra información según la pregunta

4. **Selección de archivos desde índice** (`step4-select-files-from-index.ts`)
   - Usa el índice para buscar archivos relevantes
   - El backend carga el índice desde filesystem (no se envía al frontend)

5. **Generación de respuesta** (`step5-generate-answer.ts`)
   - Construye contexto: Project Brain + Métricas + Archivos seleccionados
   - Llama a LLM (Ollama phi-3) con el contexto
   - Extrae y formatea la respuesta

## Estados del Repositorio

### idle

**Significado:** El repositorio no ha sido indexado o no existe.

**Cuándo ocurre:**
- El usuario nunca ha indexado el repositorio
- El repositorio fue eliminado del índice
- El índice no existe en el filesystem

**Qué puede hacer el usuario:**
- Indexar el repositorio
- No puede hacer chat (el backend rechazará con 400)

**Representación en UI:**
- Botón "Indexar" visible
- Estado de chat deshabilitado
- Mensaje: "Este repositorio no está indexado"

### indexing

**Significado:** El repositorio está siendo indexado actualmente.

**Cuándo ocurre:**
- El usuario inició la indexación recientemente
- El backend está procesando el repositorio en background
- Hay un lock activo en el filesystem

**Qué puede hacer el usuario:**
- Esperar (no puede cancelar desde el frontend)
- Ver progreso mediante polling
- No puede hacer chat (el backend rechazará con 202)

**Representación en UI:**
- Spinner/indicador de progreso
- Estado de chat deshabilitado
- Mensaje: "Indexando repositorio..."
- Polling automático cada 4 segundos

### ready

**Significado:** El repositorio está completamente indexado y listo para chat.

**Cuándo ocurre:**
- La indexación completó exitosamente
- El índice existe en el filesystem
- El Project Brain fue generado

**Qué puede hacer el usuario:**
- Hacer chat sobre el repositorio
- Ver métricas y estadísticas
- Consultar la arquitectura

**Representación en UI:**
- Chat habilitado
- Métricas visibles
- Estado: "Repositorio listo"
- Polling detenido

**Datos disponibles cuando está ready:**
- `stats.totalFiles`: Cantidad de archivos indexados
- `stats.totalSize`: Tamaño total del repositorio
- `stats.languages`: Lenguajes detectados
- `indexedAt`: Fecha/hora de indexación

### error

**Significado:** Hubo un error durante la indexación o el repositorio tiene un problema.

**Cuándo ocurre:**
- Falló la indexación (ej: repositorio privado sin acceso, repositorio eliminado)
- Error al procesar archivos
- Lock expirado sin completar

**Qué puede hacer el usuario:**
- Ver el mensaje de error
- Intentar re-indexar (con `force: true`)
- No puede hacer chat (el backend rechazará con 400)

**Representación en UI:**
- Indicador de error
- Mensaje de error visible
- Opción para reintentar indexación
- Estado de chat deshabilitado

## Responsabilidades por Capa

### Frontend (ControlRepo - Vercel)

**Responsabilidades:**

1. **Autenticación de usuario**
   - Firebase Auth (UI de login/logout)
   - Manejo de sesión
   - Obtención de tokens

2. **Interfaz de usuario**
   - Renderizado de componentes React
   - Formularios de entrada
   - Visualización de estados y resultados

3. **Comunicación con backend**
   - Envío de requests HTTP
   - Manejo de respuestas
   - Polling de estados

4. **Gestión de preferencias de usuario**
   - Almacenamiento en Firestore (activeRepositoryId)
   - Restauración de repositorio activo al iniciar

**Qué NO hace:**
- ❌ No accede al filesystem
- ❌ No valida lógica de negocio
- ❌ No genera respuestas de chat
- ❌ No procesa código
- ❌ No almacena índices
- ❌ No infiere estados

**Arquitectura del frontend:**

```
┌─────────────────────────────────────────┐
│         React Components                │
│  (HeaderRepository, ChatInterface, etc) │
└──────────────┬──────────────────────────┘
               │
               ↓
┌─────────────────────────────────────────┐
│      RepositoryContext (Hooks)          │
│  - indexRepository()                    │
│  - refreshStatus()                      │
│  - Polling automático                   │
└──────────────┬──────────────────────────┘
               │
               ↓
┌─────────────────────────────────────────┐
│      API Routes (Next.js)               │
│  - /api/repositories/index (proxy)      │
│  - /api/repositories/[id]/status        │
│  - /api/chat/query                      │
└──────────────┬──────────────────────────┘
               │
               ↓
┌─────────────────────────────────────────┐
│      Backend ControlFile (Render)       │
│  - Procesamiento real                   │
│  - Filesystem                           │
└─────────────────────────────────────────┘
```

### Backend ControlRepo (Proxy/Auth - Vercel)

**Responsabilidades:**

1. **Proxy de requests**
   - Redirige requests a ControlFile (Render)
   - Mantiene headers de autenticación
   - Transforma formatos si es necesario

2. **Autenticación**
   - Verifica tokens Firebase
   - Obtiene GitHub accessToken desde Firestore
   - Pasa credenciales al backend real

3. **Transformación de contratos**
   - Convierte `repositoryId` a `owner, repo` para ControlFile
   - Transforma respuestas al formato del contrato API v1
   - Normaliza códigos HTTP

**Endpoints proxy:**

- `POST /api/repositories/index` → `POST /api/repository/index` (ControlFile)
- `GET /api/repositories/{id}/status` → `GET /api/repository/status` (ControlFile)
- `POST /api/chat/query` → Procesamiento interno (puede llamar a ControlFile)

**Ejemplo de transformación:**

```typescript
// Frontend envía:
{ repositoryId: "github:owner:repo", force: false }

// Proxy transforma para ControlFile:
{ owner: "owner", repo: "repo", branch: "main", accessToken: "...", uid: "..." }
```

### Backend ControlFile (Indexación/Filesystem/Chat - Render)

**Responsabilidades:**

1. **Indexación de repositorios**
   - Clonado de repositorios de GitHub
   - Análisis de código y estructura
   - Generación de índices
   - Guardado en filesystem

2. **Gestión de locks**
   - Prevención de indexaciones simultáneas
   - Limpieza de locks expirados
   - Atomicidad de operaciones

3. **Almacenamiento en filesystem**
   - Índices de repositorios (`.repository-indexes/`)
   - Project Brains (`.project-brains/`)
   - Métricas (`.repository-metrics/`)
   - Locks (`.repository-locks/`)

4. **Procesamiento de chat**
   - Validación de disponibilidad
   - Selección de archivos relevantes
   - Generación de respuestas con LLM
   - Manejo de contexto (Project Brain, métricas)

**Ubicación de datos:**

```
/opt/render/project/src/backend/
├── indexes/
│   └── github:owner:repo.json
├── project-brains/
│   └── github:owner:repo.json
├── metrics/
│   └── github:owner:repo.json
└── locks/
    └── github:owner:repo.lock
```

**Operaciones del backend:**

- **Lectura atómica**: Lee índices desde filesystem
- **Escritura atómica**: Usa archivos temporales (.tmp) + rename
- **Locks robustos**: Eliminación real de archivos, detección de expiración
- **Persistencia**: Los archivos persisten entre deployments en Render

## Persistencia

### Dónde vive el índice

**Ubicación física:** Sistema de archivos del backend de Render

**Ruta:** `/opt/render/project/src/backend/indexes/{repositoryId}.json`

**Formato:** JSON con estructura `RepositoryIndex`:
```typescript
{
  id: "github:owner:repo",
  owner: "owner",
  repo: "repo",
  branch: "main",
  status: "completed",
  indexedAt: "2024-01-01T00:00:00.000Z",
  lastCommit: "abc123...",
  metadata: { ... },
  files: [ ... ],
  keyFiles: { ... },
  summary: { ... }
}
```

**Acceso:**
- **Escritura**: Solo desde el backend durante indexación
- **Lectura**: Backend lee para chat, proxy lee para status
- **Frontend**: Nunca accede directamente

### Por qué se usa filesystem

**Razones técnicas:**

1. **Simplicidad**: No requiere configuración de base de datos adicional
2. **Performance**: Lectura/escritura de archivos JSON es muy rápida
3. **Atomicidad**: Operaciones atómicas con rename garantizan consistencia
4. **Persistencia en Render**: Los archivos persisten entre deployments
5. **Debugging**: Fácil inspeccionar archivos manualmente

**Alternativas consideradas y rechazadas:**

**Firestore:**
- ❌ Más complejo de configurar
- ❌ Límites de tamaño de documentos (1MB)
- ❌ Costos por lectura/escritura
- ❌ No necesario para datos estructurados simples

**B2/S3 (Object Storage):**
- ❌ Agrega complejidad de configuración
- ❌ Requiere manejo de URLs y autenticación
- ❌ Overhead innecesario para archivos pequeños
- ❌ El filesystem local es suficiente para un solo backend

**Base de datos SQL/NoSQL:**
- ❌ Overkill para datos JSON simples
- ❌ Requiere migraciones y esquemas
- ❌ Más lento para lectura de documentos completos

**Decisión final:**
El filesystem local es la opción más simple y eficiente para un backend monolítico. Si en el futuro se necesita escalar horizontalmente, se puede migrar a Firestore o S3 sin cambiar la interfaz de storage.

### Política de reindexación

**Cuándo se reindexa:**

1. **Manual con force:**
   ```
   POST /api/repositories/index
   { repositoryId: "github:owner:repo", force: true }
   ```

2. **Primera indexación:**
   ```
   POST /api/repositories/index
   { repositoryId: "github:owner:repo", force: false }
   ```
   Si no existe, se indexa automáticamente.

**Qué sucede durante reindexación:**

1. **Lock acquisition**: Adquiere lock (previene duplicados)
2. **Backup opcional**: Guarda índice anterior (implementación futura)
3. **Re-clonado**: Clona el repositorio desde GitHub
4. **Re-análisis**: Analiza todo el código nuevamente
5. **Re-escritura**: Sobrescribe el índice existente
6. **Regeneración**: Regenera Project Brain y métricas
7. **Lock release**: Libera el lock

**Consideraciones:**

- **No destructivo**: Reindexar no borra otros repositorios
- **Atómico**: Si falla, el índice anterior permanece
- **Lock protection**: No puede haber dos reindexaciones simultáneas del mismo repo
- **Estado durante reindexación**: `status: "indexing"` mientras procesa

## Errores Comunes Evitados

### No enviar índices al frontend

**Error común:**
```typescript
// ❌ INCORRECTO
const index = await getRepositoryIndex(repositoryId)
return NextResponse.json(index)  // Envía todo el índice al frontend
```

**Problema:**
- Los índices pueden ser muy grandes (megabytes)
- Expone estructura interna del sistema
- El frontend no necesita esta información

**Solución correcta:**
```typescript
// ✅ CORRECTO
const index = await getRepositoryIndex(repositoryId)
return NextResponse.json({
  repositoryId,
  status: index.status,
  stats: index.stats,
  indexedAt: index.indexedAt
  // Solo metadata, no el índice completo
})
```

### No usar filesystem en Vercel

**Error común:**
```typescript
// ❌ INCORRECTO (en Vercel)
import { writeFile } from "fs/promises"
await writeFile("./indexes/repo.json", data)
```

**Problema:**
- Vercel es serverless, el filesystem es efímero
- Los archivos se pierden en cada deployment
- No es persistente entre invocaciones

**Solución correcta:**
- **ControlRepo (Vercel)**: Solo proxies, no escribe filesystem
- **ControlFile (Render)**: Backend monolítico con filesystem persistente

**Arquitectura correcta:**
```
Vercel (ControlRepo)
  ↓ (proxy HTTP)
Render (ControlFile)
  ↓ (filesystem persistente)
/opt/render/project/src/backend/indexes/
```

### No inferir estados en el frontend

**Error común:**
```typescript
// ❌ INCORRECTO
if (!repositoryId) {
  setStatus("idle")  // Frontend infiere estado
}

if (lastUpdate > 5 minutes ago) {
  setStatus("ready")  // Frontend asume estado
}
```

**Problema:**
- El frontend puede estar desincronizado con el backend
- Estados inferidos pueden ser incorrectos
- Lógica duplicada entre frontend y backend

**Solución correcta:**
```typescript
// ✅ CORRECTO
// Siempre consultar al backend
const response = await fetch(`/api/repositories/${repositoryId}/status`)
const data = await response.json()
setStatus(data.status)  // Usar estado del backend
```

**Principio:**
El frontend **nunca** infiere estados. Siempre consulta al backend y confía en su respuesta.

### No validar en el frontend

**Error común:**
```typescript
// ❌ INCORRECTO
if (!owner || !repo) {
  return // Frontend valida y bloquea
}
// Asume que el backend aceptará
```

**Problema:**
- Validación duplicada
- El frontend puede tener reglas diferentes al backend
- Cambios en el backend requieren cambios en el frontend

**Solución correcta:**
```typescript
// ✅ CORRECTO
// Validación básica (formato) en frontend
if (!repositoryId.startsWith("github:")) {
  setError("Formato inválido")
  return
}

// Enviar al backend (backend valida completamente)
const response = await fetch("/api/repositories/index", {
  body: JSON.stringify({ repositoryId })
})

// Backend responde con error si es necesario
if (!response.ok) {
  const error = await response.json()
  setError(error.message)
}
```

## Decisiones Clave

### Por qué no Firestore para índices

**Razones:**

1. **Límite de tamaño**: Firestore tiene límite de 1MB por documento. Los índices pueden ser más grandes.

2. **Estructura compleja**: Los índices tienen estructura anidada profunda (árbol de archivos, relaciones). Firestore no es ideal para esto.

3. **Costos**: Firestore cobra por lectura/escritura. Los índices se leen frecuentemente durante chat, incrementando costos.

4. **Simplicidad**: JSON en filesystem es más simple de manejar para este caso de uso.

5. **Persistencia suficiente**: Render mantiene el filesystem entre deployments, suficiente para un backend monolítico.

**Cuándo considerar Firestore:**
- Si se necesita escalar horizontalmente (múltiples instancias)
- Si se necesita búsqueda compleja sobre índices
- Si se necesita sincronización en tiempo real entre instancias

### Por qué no B2 (Backblaze B2) u Object Storage

**Razones:**

1. **Complejidad innecesaria**: Agrega configuración de credenciales, URLs, autenticación.

2. **Latencia**: Agregar una capa de red para almacenamiento local no es necesario.

3. **Overhead**: Para archivos JSON pequeños, el overhead de HTTP/HTTPS no vale la pena.

4. **Escalabilidad prematura**: No se necesita escalabilidad horizontal aún. El filesystem local es suficiente.

**Cuándo considerar B2/S3:**
- Si se necesita almacenamiento compartido entre múltiples instancias
- Si se necesita backup automático y redundancia
- Si se superan los límites de espacio del filesystem local

### Por qué no GitHub auth directo para el chat

**Razón principal:** Separación de responsabilidades.

**Arquitectura actual:**
```
Usuario → Firebase Auth → ControlRepo
                          ↓
                    Obtiene GitHub token desde Firestore
                          ↓
                    ControlFile usa token para indexar/chat
```

**Por qué funciona así:**

1. **Firebase Auth centralizado**: Un solo sistema de autenticación para toda la aplicación.

2. **GitHub OAuth separado**: El flujo OAuth de GitHub se hace una vez, se guarda en Firestore, luego se reutiliza.

3. **ControlRepo como intermediario**: ControlRepo (Vercel) tiene acceso a Firestore, obtiene el token, lo pasa a ControlFile.

4. **ControlFile no accede a Firestore**: ControlFile (Render) no necesita acceso a Firestore, solo recibe el token cuando lo necesita.

**Alternativa rechazada:**
```
Usuario → GitHub OAuth → ControlFile directamente
```

**Por qué se rechazó:**
- ControlFile tendría que manejar OAuth directamente
- No hay unión con sistema de usuarios de la aplicación
- Más complejo mantener sesiones separadas

**Ventajas de la arquitectura actual:**
- Un solo sistema de autenticación (Firebase)
- GitHub token se obtiene una vez, se reutiliza
- ControlFile no necesita acceso a Firestore
- Más simple de mantener y debuggear

## Estructura de Archivos del Sistema

```
ControlRepo (Frontend - Vercel)
├── app/
│   ├── api/
│   │   ├── repositories/
│   │   │   ├── index/
│   │   │   │   └── route.ts          # Proxy a ControlFile
│   │   │   └── [repositoryId]/
│   │   │       └── status/
│   │   │           └── route.ts      # Proxy a ControlFile
│   │   ├── repository/
│   │   │   └── index/
│   │   │       └── route.ts          # Proxy con auth
│   │   └── chat/
│   │       └── query/
│   │           └── route.ts          # Procesamiento de chat
│   └── page.tsx
├── components/
│   ├── header-repository.tsx         # UI de repositorio
│   ├── chat-interface.tsx            # UI de chat
│   └── ...
├── lib/
│   ├── repository-context.tsx        # Estado y lógica de repositorio
│   ├── types/
│   │   └── api-contract.ts           # Tipos del contrato API v1
│   └── ...

ControlFile (Backend - Render)
├── backend/
│   ├── indexes/                      # Índices de repositorios
│   │   └── github:owner:repo.json
│   ├── project-brains/               # Project Brains
│   │   └── github:owner:repo.json
│   ├── metrics/                      # Métricas
│   │   └── github:owner:repo.json
│   └── locks/                        # Locks de indexación
│       └── github:owner:repo.lock
└── ...
```

## Notas para Mantenimiento Futuro

### Cambios que requieren actualizar el contrato

Si se modifica:
- Formatos de request/response
- Códigos HTTP
- Estructura de `repositoryId`
- Estados del repositorio

**Acción requerida:**
1. Actualizar `docs/CONTRATO-API.md`
2. Actualizar `lib/types/api-contract.ts`
3. Actualizar esta documentación
4. Comunicar cambios a todos los desarrolladores

### Escalabilidad futura

**Si se necesita escalar horizontalmente:**

1. **Migrar índices a Firestore o S3**
   - Cambiar implementación de `RepositoryStorage`
   - Mantener misma interfaz (`storage.ts`)
   - No requiere cambios en el contrato API

2. **Múltiples instancias de ControlFile**
   - Usar almacenamiento compartido (S3, Firestore)
   - Usar queue system para indexación (Redis, AWS SQS)
   - Load balancer delante de ControlFile

3. **Cache en ControlRepo**
   - Cache de respuestas de status (si no cambia frecuentemente)
   - No cachear respuestas de chat (siempre frescas)

### Debugging

**Logs importantes:**

1. **Frontend (ControlRepo):**
   - `console.log("Index request payload:", { repositoryId })`
   - Errores de fetch y respuestas del backend

2. **Proxy (ControlRepo API routes):**
   - Transformaciones de requests
   - Errores de conexión a ControlFile

3. **Backend (ControlFile):**
   - Operaciones de filesystem (lectura/escritura)
   - Adquisición/liberación de locks
   - Procesamiento de indexación
   - Generación de respuestas de chat

**Herramientas de debugging:**
- Inspeccionar archivos en filesystem de Render
- Revisar logs de Vercel para proxies
- Revisar logs de Render para procesamiento
- Verificar estado de locks manualmente

## Resumen Ejecutivo

### Arquitectura en 3 puntos

1. **Backend es la única fuente de verdad**: El backend (ControlFile) decide todo. El frontend solo consume.

2. **Frontend es completamente pasivo**: No procesa código, no infiere estados, no accede a filesystem.

3. **Contrato API estricto**: Todas las interacciones siguen un contrato explícito (API v1) definido en `docs/CONTRATO-API.md`.

### Flujo principal

```
Usuario selecciona repo
  ↓
Frontend: POST /api/repositories/index { repositoryId }
  ↓
Backend: Indexa en background, retorna { status: "indexing" }
  ↓
Frontend: Polling cada 4s hasta { status: "ready" }
  ↓
Usuario hace pregunta
  ↓
Frontend: POST /api/chat/query { repositoryId, question }
  ↓
Backend: Selecciona archivos, genera respuesta, retorna { response, sources }
  ↓
Frontend: Muestra respuesta y archivos usados
```

### Principios fundamentales

- ✅ Backend decide, frontend consume
- ✅ Nunca enviar índices al frontend
- ✅ Nunca usar filesystem en Vercel
- ✅ Nunca inferir estados en el frontend
- ✅ Siempre consultar al backend para estados
- ✅ Contrato API explícito y estricto

⚠️ Este servicio NO es público.
⚠️ Este servicio es consumido exclusivamente por ControlFile.
⚠️ El frontend nunca debe llamar a este servicio.
# 🧠 Diseño del Flujo de Chat - ControlFile + ControlRepo

**Estado:** 📋 Diseño Propuesto (NO implementado)  
**Fecha:** 2024-12-XX  
**Versión:** 1.0.0

---

## 🎯 Objetivo

Diseñar y documentar el flujo definitivo de chat usando:
- **ControlFile** como orquestador único
- **ControlRepo** como servicio de inteligencia (LLM Service)

---

## ✅ Decisión Arquitectónica Adoptada

**Opción A: ControlFile Orquesta, ControlRepo Ejecuta**

- **ControlFile**: Orquestador central, endpoint público, validación, normalización
- **ControlRepo**: Servicio interno de LLM, RAG, soporte de motores (Ollama local, cloud futuro)

---

## 🔄 Flujo Completo Paso a Paso

```
┌─────────────┐
│  Frontend   │
│  (Next.js)  │
└──────┬──────┘
       │
       │ POST /api/chat/query
       │ {
       │   repositoryId: "github:owner:repo",
       │   question: "¿Cómo funciona X?",
       │   conversationId: "conv-123" (opcional),
       │   role: "developer" (opcional)
       │ }
       │
       ▼
┌─────────────────────────────────────────────────────────────┐
│                    ControlFile Backend                      │
│                    (Express.js)                              │
│                                                              │
│  1. Validar autenticación (Firebase Auth)                    │
│  2. Validar repositoryId (formato, existencia)               │
│  3. Verificar estado del repositorio                         │
│     - Si 'indexing' → 202 Accepted                           │
│     - Si 'idle' o 'error' → 400 Bad Request                  │
│     - Si 'ready' → Continuar                                 │
│  4. Cargar índice del repositorio (filesystem)               │
│  5. Preparar contexto (Project Brain, métricas si existen)  │
│  6. Orquestar llamada a ControlRepo                          │
└──────┬───────────────────────────────────────────────────────┘
       │
       │ POST /internal/llm/query
       │ {
       │   question: "...",
       │   repositoryId: "...",
       │   role: "developer",
       │   conversationMemory: [...],
       │   context: {
       │     index: {...},           // Índice completo
       │     projectBrain: {...},    // Si existe
       │     metrics: {...}          // Si existe
       │   },
       │   options: {
       │     engine: "ollama" | "cloud",
       │     model: "phi3:mini",
       │     temperature: 0.7
       │   }
       │ }
       │
       ▼
┌─────────────────────────────────────────────────────────────┐
│                    ControlRepo Service                       │
│                    (LLM Service)                             │
│                                                              │
│  1. Recibir query y contexto                                 │
│  2. Ejecutar RAG (Retrieval Augmented Generation)            │
│     - Buscar archivos relevantes en el índice                │
│     - Extraer contexto específico                            │
│     - Combinar con Project Brain y métricas                   │
│  3. Construir prompt completo                                │
│  4. Llamar al motor LLM seleccionado:                        │
│     - Dev: Ollama local (phi3:mini)                          │
│     - Prod: Cloud LLM (futuro)                               │
│  5. Generar respuesta con citas a fuentes                   │
│  6. Retornar respuesta estructurada                         │
└──────┬───────────────────────────────────────────────────────┘
       │
       │ 200 OK
       │ {
       │   answer: "La respuesta generada...",
       │   files: [
       │     {
       │       path: "src/auth.ts",
       │       lines: [10, 25],
       │       relevance: 0.95
       │     }
       │   ],
       │   findings: [
       │     {
       │       type: "function",
       │       name: "authenticate",
       │       path: "src/auth.ts",
       │       line: 15
       │     }
       │   ],
       │   debug: {
       │     engine: "ollama",
       │     model: "phi3:mini",
       │     location: "local",
       │     tokensUsed: 150,
       │     latency: 1.2
       │   }
       │ }
       │
       ▼
┌─────────────────────────────────────────────────────────────┐
│                    ControlFile Backend                      │
│                                                              │
│  7. Normalizar respuesta                                      │
│     - Mapear formato interno → formato público               │
│     - Validar estructura                                     │
│     - Agregar metadata de ControlFile                        │
│  8. Manejar fallback si ControlRepo falla                    │
│  9. Retornar respuesta al frontend                           │
└──────┬───────────────────────────────────────────────────────┘
       │
       │ 200 OK
       │ {
       │   response: "La respuesta generada...",
       │   conversationId: "conv-123",
       │   sources: [
       │     {
       │       path: "src/auth.ts",
       │       lines: [10, 25]
       │     }
       │   ],
       │   debug: {              // Solo en modo dev
       │     engine: "ollama",
       │     model: "phi3:mini",
       │     location: "local"
       │   }
       │ }
       │
       ▼
┌─────────────┐
│  Frontend   │
│  (Next.js)  │
└─────────────┘
```

---

## 📋 Responsabilidades por Sistema

### ControlFile (Orquestador)

#### ✅ Responsabilidades

1. **Endpoint Público de Chat**
   - `POST /api/chat/query` - Único endpoint expuesto al frontend
   - Validación de autenticación (Firebase Auth)
   - Rate limiting y seguridad

2. **Validación de Usuario/Repositorio**
   - Validar formato de `repositoryId` (`github:owner:repo`)
   - Verificar que el usuario tiene acceso al repositorio
   - Verificar estado del repositorio (`ready`, `indexing`, `idle`, `error`)

3. **Orquestación**
   - Cargar índice completo desde filesystem
   - Cargar Project Brain y métricas (si existen)
   - Preparar contexto para ControlRepo
   - Llamar a ControlRepo con payload estructurado
   - Manejar timeouts y errores de ControlRepo

4. **Normalización de Respuestas**
   - Mapear respuesta interna de ControlRepo → formato público
   - Validar estructura de respuesta
   - Agregar metadata de ControlFile (timestamps, etc.)
   - Filtrar información sensible (debug solo en dev)

5. **Manejo de Fallback**
   - Si ControlRepo no responde → respuesta degradada
   - Si ControlRepo falla → error controlado con mensaje claro
   - Logging detallado para debugging

#### ❌ NO Responsabilidades

- ❌ NO ejecuta LLM directamente
- ❌ NO hace RAG directamente
- ❌ NO gestiona motores LLM (Ollama, cloud)
- ❌ NO genera embeddings
- ❌ NO procesa prompts complejos

---

### ControlRepo (Servicio de Inteligencia)

#### ✅ Responsabilidades

1. **Servicio Interno de LLM**
   - `POST /internal/llm/query` - Endpoint interno (NO público)
   - Procesar queries con contexto completo
   - Ejecutar RAG sobre el índice proporcionado

2. **RAG (Retrieval Augmented Generation)**
   - Buscar archivos relevantes en el índice
   - Extraer contexto específico según la pregunta
   - Combinar con Project Brain y métricas
   - Generar embeddings si es necesario (futuro)

3. **Soporte de Motores LLM**
   - **Modo Dev**: Ollama local (`phi3:mini`)
   - **Modo Prod**: Cloud LLM (OpenAI, Anthropic, etc. - futuro)
   - Selección automática según configuración
   - Fallback entre motores si uno falla

4. **Generación de Respuestas**
   - Construir prompt completo con contexto
   - Llamar al motor LLM seleccionado
   - Generar respuesta con citas a fuentes
   - Extraer findings (funciones, clases, etc.)

5. **Debug y Visibilidad**
   - Retornar información del motor usado
   - Retornar métricas (tokens, latency)
   - Retornar ubicación (local vs cloud)

#### ❌ NO Responsabilidades

- ❌ NO valida autenticación de usuarios
- ❌ NO valida acceso a repositorios
- ❌ NO gestiona índices (solo los consume)
- ❌ NO expone endpoints públicos
- ❌ NO normaliza respuestas para frontend

---

## 🔌 Contrato HTTP: ControlFile → ControlRepo

### Endpoint

```
POST /internal/llm/query
```

**⚠️ IMPORTANTE:** Este endpoint es **INTERNO** y **NO debe exponerse públicamente**.

- Solo debe ser accesible desde ControlFile
- Validación mediante header `X-ControlFile-Signature` (futuro)
- O mediante red privada/VPN (producción)

**📝 Nota Futura - Naming del Endpoint:**
- `/internal/llm/query` está bien para la implementación inicial
- A largo plazo, cuando el servicio crezca, podrías necesitar:
  - `/internal/ai/chat` - Para queries de chat
  - `/internal/ai/flows` - Para flujos complejos de análisis
  - `/internal/ai/analysis` - Para análisis estáticos
- No es urgente, pero tenlo en mente para la evolución del servicio

---

### Request

```typescript
interface LLMQueryRequest {
  // Datos de la consulta
  question: string;                    // REQUERIDO: Pregunta del usuario
  repositoryId: string;                 // REQUERIDO: ID del repositorio (github:owner:repo)
  
  // Contexto de conversación
  conversationMemory?: Array<{        // OPCIONAL: Historial de conversación
    role: "user" | "assistant";
    content: string;
    timestamp: string;
  }>;
  
  // Rol del usuario (afecta el tipo de respuesta)
  role?: "developer" | "manager" | "analyst";  // OPCIONAL: Default "developer"
  
  // Contexto completo del repositorio
  context: {
    mode?: "full" | "references";      // OPCIONAL: Modo de contexto (ver nota futura)
    index: {                           // REQUERIDO: Índice completo del repositorio
      files: Array<{
        path: string;
        content: string;               // ⚠️ FUTURO: En modo "references", solo IDs/paths
        language?: string;
        size: number;
      }>;
      tree: any;                       // Estructura de directorios
      stats: {
        totalFiles: number;
        totalSize: number;
        languages: Record<string, number>;
      };
    };
    projectBrain?: {                   // OPCIONAL: Project Brain si existe
      summary: string;
      architecture: string;
      keyComponents: Array<string>;
      dependencies: Array<string>;
    };
    metrics?: {                        // OPCIONAL: Métricas si existen
      complexity: number;
      testCoverage?: number;
      documentation?: number;
    };
  };
  
  // Opciones de ejecución
  options?: {
    engine?: "ollama" | "cloud";       // OPCIONAL: Preferencia de motor
    model?: string;                    // OPCIONAL: Modelo específico (ej: "phi3:mini")
    temperature?: number;              // OPCIONAL: Default 0.7
    maxTokens?: number;                // OPCIONAL: Límite de tokens
    includeDebug?: boolean;            // OPCIONAL: Incluir info de debug
  };
}
```

**Ejemplo:**

```json
{
  "question": "¿Cómo funciona la autenticación en este proyecto?",
  "repositoryId": "github:owner:repo",
  "role": "developer",
  "conversationMemory": [
    {
      "role": "user",
      "content": "¿Qué tecnologías usa este proyecto?",
      "timestamp": "2024-01-01T12:00:00Z"
    },
    {
      "role": "assistant",
      "content": "Este proyecto usa TypeScript, React y Firebase...",
      "timestamp": "2024-01-01T12:00:05Z"
    }
  ],
  "context": {
    "index": {
      "files": [...],
      "tree": {...},
      "stats": {...}
    },
    "projectBrain": {
      "summary": "Aplicación web moderna...",
      "architecture": "MVC con componentes React...",
      "keyComponents": ["AuthService", "FileManager"],
      "dependencies": ["react", "firebase"]
    },
    "metrics": {
      "complexity": 7.5,
      "testCoverage": 65
    }
  },
  "options": {
    "engine": "ollama",
    "model": "phi3:mini",
    "temperature": 0.7,
    "includeDebug": true
  }
}
```

**📝 Nota Futura - Optimización de Contexto Pesado:**

⚠️ **Consideración importante:** Para repositorios grandes, enviar el contenido completo de todos los archivos (`context.index.files[].content`) puede ser muy pesado y ControlRepo no siempre necesita TODO el contenido.

**Optimización futura propuesta:**

1. **Modo "references"** (producción):
   ```typescript
   context: {
     mode: "references",
     index: {
       files: Array<{
         path: string;
         // content: NO se envía
         fileId: string;              // ID para solicitar fragmentos después
         language?: string;
         size: number;
         relevance?: number;          // Score inicial de relevancia
       }>
     }
   }
   ```
   - ControlRepo primero identifica archivos relevantes
   - Luego solicita fragmentos específicos: `POST /internal/ai/fragments` con `{ fileIds: [...], ranges: [...] }`
   - ControlFile responde solo con los fragmentos solicitados

2. **Modo "full"** (desarrollo):
   ```typescript
   context: {
     mode: "full",
     index: {
       files: Array<{
         path: string;
         content: string;             // Contenido completo
         // ...
       }>
     }
   }
   ```
   - Útil para desarrollo y repos pequeños
   - Evita round-trips adicionales

**Implementación futura:**
- No cambiar ahora, solo tenerlo en mente
- Evaluar cuando repos grandes (>1000 archivos) empiecen a causar problemas de performance
- Considerar límite de tamaño antes de activar modo "references" automáticamente

---

### Response

```typescript
interface LLMQueryResponse {
  // Respuesta principal
  answer: string;                     // REQUERIDO: Respuesta generada por el LLM
  
  // Archivos citados en la respuesta
  files: Array<{                      // REQUERIDO: Archivos relevantes encontrados
    path: string;
    lines: [number, number];          // Rango de líneas relevantes [start, end]
    relevance: number;                // Score de relevancia (0-1)
    excerpt?: string;                 // OPCIONAL: Fragmento del código citado
  }>;
  
  // Hallazgos estructurados
  findings?: Array<{                  // OPCIONAL: Entidades encontradas
    type: "function" | "class" | "interface" | "variable" | "import";
    name: string;
    path: string;
    line: number;
    description?: string;
  }>;
  
  // Información de debug (solo si includeDebug: true)
  debug?: {
    engine: "ollama" | "cloud";
    model: string;
    location: "local" | "cloud";
    tokensUsed: number;
    latency: number;                  // Segundos
    retrievalTime?: number;           // Tiempo de RAG
    generationTime?: number;          // Tiempo de generación
  };
  
  // Metadata
  timestamp: string;                  // ISO 8601
  conversationId?: string;            // OPCIONAL: ID de conversación si se proporcionó
}
```

**Ejemplo:**

```json
{
  "answer": "La autenticación en este proyecto funciona mediante Firebase Auth. El componente principal es `AuthService` ubicado en `src/services/auth.ts`. Utiliza tokens JWT y maneja sesiones mediante cookies seguras...",
  "files": [
    {
      "path": "src/services/auth.ts",
      "lines": [10, 45],
      "relevance": 0.95,
      "excerpt": "export class AuthService {\n  async authenticate(token: string) {\n    // ...\n  }\n}"
    },
    {
      "path": "src/middleware/auth.ts",
      "lines": [5, 20],
      "relevance": 0.82
    }
  ],
  "findings": [
    {
      "type": "class",
      "name": "AuthService",
      "path": "src/services/auth.ts",
      "line": 15,
      "description": "Servicio principal de autenticación"
    },
    {
      "type": "function",
      "name": "authenticate",
      "path": "src/services/auth.ts",
      "line": 20
    }
  ],
  "debug": {
    "engine": "ollama",
    "model": "phi3:mini",
    "location": "local",
    "tokensUsed": 150,
    "latency": 1.2,
    "retrievalTime": 0.3,
    "generationTime": 0.9
  },
  "timestamp": "2024-01-01T12:00:10Z",
  "conversationId": "conv-123"
}
```

---

### Códigos de Estado HTTP

- **200 OK**: Query procesada exitosamente
- **400 Bad Request**: Request inválido (falta `question`, `repositoryId`, etc.)
- **500 Internal Server Error**: Error en ControlRepo (LLM falló, RAG falló, etc.)
- **503 Service Unavailable**: ControlRepo no disponible (servicio caído)

---

## 🛡️ Manejo de Fallback

### Escenario 1: ControlRepo No Responde (Timeout)

**Comportamiento:**
1. ControlFile espera máximo 30 segundos
2. Si timeout → Retornar respuesta degradada

**Respuesta Degradada:**
```json
{
  "response": "Lo siento, el servicio de inteligencia no está disponible en este momento. Por favor, intenta de nuevo más tarde.",
  "conversationId": "conv-123",
  "sources": [],
  "error": {
    "type": "service_unavailable",
    "message": "ControlRepo no respondió en el tiempo esperado"
  }
}
```

**Código HTTP:** `503 Service Unavailable`

**📝 Nota Futura - Fallback Degradado Mejorado:**
- El fallback actual devuelve un mensaje genérico
- A futuro, podrías mejorar la UX con:
  - **Search-only mode**: Devolver resultados de búsqueda sin LLM (usando lógica de búsqueda simple)
  - **Reutilizar lógica legacy**: Usar la implementación básica de `processQuery` que existe en `chat-service.js`
  - Esto proporcionaría valor incluso cuando ControlRepo no está disponible
- Es una mejora UX, no un requisito para la implementación inicial

---

### Escenario 2: ControlRepo Retorna Error 500

**Comportamiento:**
1. ControlFile recibe error de ControlRepo
2. Loggear error detallado
3. Retornar error controlado al frontend

**Respuesta:**
```json
{
  "error": "Error procesando query",
  "message": "El servicio de inteligencia encontró un error. Por favor, intenta reformular tu pregunta.",
  "conversationId": "conv-123"
}
```

**Código HTTP:** `500 Internal Server Error`

---

### Escenario 3: ControlRepo No Disponible (Servicio Caído)

**Comportamiento:**
1. ControlFile detecta que ControlRepo no está disponible
2. Health check falla
3. Retornar respuesta degradada inmediatamente (sin intentar llamar)

**Respuesta:**
```json
{
  "response": "El servicio de inteligencia no está disponible en este momento. Por favor, intenta más tarde.",
  "conversationId": "conv-123",
  "sources": [],
  "error": {
    "type": "service_unavailable",
    "message": "ControlRepo no está disponible"
  }
}
```

**Código HTTP:** `503 Service Unavailable`

---

### Escenario 4: Modo Dev - Ollama No Disponible

**Comportamiento:**
1. ControlRepo detecta que Ollama no está corriendo
2. Retornar error específico con instrucciones

**Respuesta desde ControlRepo:**
```json
{
  "error": "ollama_not_available",
  "message": "Ollama no está corriendo. Inicia Ollama con: ollama serve",
  "debug": {
    "engine": "ollama",
    "location": "local",
    "available": false
  }
}
```

**ControlFile normaliza a:**
```json
{
  "error": "Error de configuración",
  "message": "El servicio de inteligencia local no está disponible. Verifica que Ollama esté corriendo.",
  "conversationId": "conv-123"
}
```

---

## 🔍 Debug y Visibilidad de Motor LLM

### Información de Debug

La información de debug se incluye en la respuesta **SOLO** cuando:
- `options.includeDebug === true` en el request
- O cuando `NODE_ENV === 'development'` en ControlFile

### Campos de Debug

```typescript
{
  debug: {
    engine: "ollama" | "cloud";      // Motor usado
    model: string;                    // Modelo específico (ej: "phi3:mini")
    location: "local" | "cloud";      // Dónde se ejecutó
    tokensUsed: number;                // Tokens consumidos
    latency: number;                  // Latencia total (segundos)
    retrievalTime?: number;           // Tiempo de RAG
    generationTime?: number;          // Tiempo de generación LLM
  }
}
```

### Visibilidad en Frontend

- **Modo Dev**: Debug visible en respuesta
- **Modo Prod**: Debug filtrado (no se envía al frontend)

---

## 🏗️ Modo Dev vs Modo Prod

### Modo Dev (Desarrollo Local)

**ControlRepo:**
- Motor LLM: Ollama local
- Modelo: `phi3:mini` (default)
- Endpoint: `http://localhost:PORT/internal/llm/query`
- Debug: Habilitado por defecto

**ControlFile:**
- `NODE_ENV=development`
- Debug incluido en respuestas
- Logs detallados
- Timeout más largo (60 segundos)

---

### Modo Prod (Producción)

**ControlRepo:**
- Motor LLM: Cloud LLM (futuro: OpenAI, Anthropic, etc.)
- Modelo: Configurable por entorno
- Endpoint: `https://controlrepo.controldoc.app/internal/llm/query`
- Debug: Solo si se solicita explícitamente

**ControlFile:**
- `NODE_ENV=production`
- Debug filtrado de respuestas
- Logs estructurados
- Timeout estándar (30 segundos)
- Rate limiting estricto

---

## 📍 Endpoints: Estado y Migración

### ✅ Endpoints que se MANTIENEN

1. **`POST /api/chat/query`** (ControlFile)
   - **Estado**: ✅ Se mantiene (endpoint público principal)
   - **Cambios**: Internamente ahora llama a ControlRepo
   - **Frontend**: Sin cambios necesarios

---

### 🔄 Endpoints que se RENOMBRAN o ENCAPSULAN

1. **`POST /internal/llm/query`** (ControlRepo) - **NUEVO**
   - **Estado**: 🆕 Nuevo endpoint interno
   - **Acceso**: Solo desde ControlFile (no público)
   - **Propósito**: Reemplaza lógica LLM que estaba en ControlFile

---

### ❌ Endpoints que quedan OBSOLETOS

**Ninguno identificado actualmente.**

Si existen endpoints de chat en ControlRepo que el frontend llama directamente, estos deben:
1. Marcarse como deprecated
2. Redirigirse a través de ControlFile
3. Eliminarse en versión futura

---

## ✅ Confirmación Explícita

### 🚫 El Frontend NUNCA Llama Directo al LLM

**GARANTÍA ARQUITECTÓNICA:**

```
Frontend → ControlFile → ControlRepo → LLM
   ✅          ✅            ✅         ✅

Frontend → ControlRepo → LLM
   ❌          ❌            ❌
```

**Razones:**
1. **Seguridad**: ControlFile valida autenticación y permisos
2. **Orquestación**: ControlFile carga índices y contexto
3. **Normalización**: ControlFile unifica formato de respuestas
4. **Fallback**: ControlFile maneja errores y degradación
5. **Observabilidad**: ControlFile centraliza logs y métricas

**Implementación:**
- El endpoint `/internal/llm/query` de ControlRepo **NO debe exponerse públicamente**
- Solo debe ser accesible desde ControlFile (red privada o validación de origen)
- El frontend **SOLO** conoce `/api/chat/query` en ControlFile

---

## 📊 Diagrama de Responsabilidades

```
┌─────────────────────────────────────────────────────────────┐
│                        Frontend                             │
│                                                             │
│  Responsabilidades:                                         │
│  - UI de chat                                               │
│  - Manejo de conversaciones                                 │
│  - Renderizado de respuestas y fuentes                      │
│                                                             │
│  Endpoints que usa:                                         │
│  ✅ POST /api/chat/query (ControlFile)                     │
└─────────────────────────────────────────────────────────────┘
                            │
                            │ HTTP
                            ▼
┌─────────────────────────────────────────────────────────────┐
│                    ControlFile Backend                     │
│                                                             │
│  Responsabilidades:                                         │
│  ✅ Endpoint público /api/chat/query                        │
│  ✅ Validación de autenticación                             │
│  ✅ Validación de repositorio                                │
│  ✅ Carga de índices (filesystem)                           │
│  ✅ Carga de Project Brain y métricas                       │
│  ✅ Orquestación de llamada a ControlRepo                   │
│  ✅ Normalización de respuestas                             │
│  ✅ Manejo de fallback                                      │
│                                                             │
│  Endpoints que expone:                                      │
│  ✅ POST /api/chat/query (público)                          │
│                                                             │
│  Endpoints que llama:                                       │
│  ✅ POST /internal/llm/query (ControlRepo)                  │
└─────────────────────────────────────────────────────────────┘
                            │
                            │ HTTP Interno
                            ▼
┌─────────────────────────────────────────────────────────────┐
│                    ControlRepo Service                      │
│                                                             │
│  Responsabilidades:                                         │
│  ✅ Servicio interno de LLM                                 │
│  ✅ RAG (Retrieval Augmented Generation)                    │
│  ✅ Soporte de motores (Ollama, Cloud)                      │
│  ✅ Generación de respuestas                                │
│  ✅ Extracción de findings                                  │
│  ✅ Debug y métricas                                        │
│                                                             │
│  Endpoints que expone:                                      │
│  ✅ POST /internal/llm/query (interno, NO público)         │
│                                                             │
│  Motores LLM:                                               │
│  ✅ Dev: Ollama local (phi3:mini)                           │
│  ✅ Prod: Cloud LLM (futuro)                                │
└─────────────────────────────────────────────────────────────┘
                            │
                            │ API Calls
                            ▼
┌─────────────────────────────────────────────────────────────┐
│                    Motores LLM                              │
│                                                             │
│  Ollama (Dev):                                              │
│  - Modelo: phi3:mini                                        │
│  - Ubicación: Local                                         │
│                                                             │
│  Cloud LLM (Prod - Futuro):                                 │
│  - OpenAI / Anthropic / etc.                                │
│  - Ubicación: Cloud                                         │
└─────────────────────────────────────────────────────────────┘
```

---

## 🔐 Seguridad

### Validación de Origen (Futuro)

**ControlRepo debe validar que las requests vienen de ControlFile:**

1. **Header de Firma** (Recomendado):
   ```
   X-ControlFile-Signature: <HMAC_SHA256>
   ```

2. **Red Privada** (Alternativa):
   - ControlFile y ControlRepo en misma VPC
   - Firewall bloquea acceso externo a `/internal/llm/query`

3. **Token de Servicio** (Alternativa):
   ```
   Authorization: Bearer <SERVICE_TOKEN>
   ```

---

## 📝 Notas de Implementación Futura

### Fase 1: Integración Básica
- [ ] Implementar endpoint `/internal/llm/query` en ControlRepo
- [ ] Modificar `chat-service.js` en ControlFile para llamar a ControlRepo
- [ ] Implementar manejo de fallback básico
- [ ] Testing con Ollama local

### Fase 2: RAG Completo
- [ ] Implementar RAG en ControlRepo
- [ ] Integración con Project Brain
- [ ] Extracción de findings estructurados
- [ ] Optimización de búsqueda de archivos relevantes

### Fase 3: Producción
- [ ] Integración con Cloud LLM
- [ ] Validación de origen (firma/red privada)
- [ ] Métricas y observabilidad
- [ ] Rate limiting en ControlRepo

---

## 📚 Referencias

- [Arquitectura de Repositorios](./ARQUITECTURA_REPOSITORIOS.md)
- [Truth Document](./TRUTH.md)
- ControlRepo: Implementación de LLM con Ollama (phi3:mini)

---

**Última actualización:** 2024-12-XX  
**Versión:** 1.0.0  
**Estado:** 📋 Diseño Propuesto (NO implementado)

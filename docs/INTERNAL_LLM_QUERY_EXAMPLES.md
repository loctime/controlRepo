# Ejemplos de Uso del Endpoint Interno /internal/llm/query

## ⚠️ Importante

Este endpoint es **INTERNO** y **NO debe exponerse públicamente**.
- Solo debe ser llamado por ControlFile
- NO valida autenticación de usuario final
- NO debe estar expuesto en rutas públicas

---

## Endpoint

```
POST /internal/llm/query
```

---

## Ejemplo de Request

```json
{
  "question": "¿Cómo funciona la autenticación en este proyecto?",
  "repositoryId": "github:owner:repo",
  "role": "architecture-explainer",
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
      "id": "github:owner:repo",
      "owner": "owner",
      "repo": "repo",
      "branch": "main",
      "defaultBranch": "main",
      "status": "completed",
      "indexedAt": "2024-01-01T00:00:00.000Z",
      "lastCommit": "abc123...",
      "metadata": {
        "description": "Repositorio de ejemplo",
        "language": "TypeScript"
      },
      "files": [
        {
          "path": "src/auth.ts",
          "name": "auth.ts",
          "directory": "src",
          "size": 1024,
          "sha": "sha123",
          "language": "typescript",
          "lines": 50,
          "category": "service",
          "type": "service-ts",
          "tags": ["auth", "security"],
          "summary": {
            "description": "Servicio de autenticación",
            "exports": ["authenticate", "logout"],
            "functions": ["authenticate", "logout", "validateToken"],
            "imports": ["firebase/auth"]
          },
          "relations": {
            "imports": ["lib/utils.ts"],
            "importedBy": ["middleware/auth.ts"],
            "dependsOn": [],
            "requiredBy": [],
            "related": []
          },
          "isKeyFile": false,
          "isDocumentation": false
        }
      ],
      "keyFiles": {
        "readme": "README.md",
        "packageJson": "package.json"
      },
      "summary": {
        "totalFiles": 100,
        "totalLines": 5000,
        "languages": {
          "typescript": 4000,
          "javascript": 1000
        },
        "categories": {
          "component": 20,
          "service": 10,
          "config": 5,
          "docs": 3,
          "test": 15,
          "utility": 10,
          "hook": 5,
          "style": 2,
          "other": 30
        },
        "structure": {
          "components": 20,
          "hooks": 5,
          "services": 10,
          "configs": 5,
          "docs": 3,
          "tests": 15
        }
      }
    },
    "projectBrain": {
      "repositoryId": "github:owner:repo",
      "createdAt": "2024-01-01T00:00:00.000Z",
      "updatedAt": "2024-01-01T00:00:00.000Z",
      "summary": {
        "totalFiles": 100,
        "mainLanguages": ["TypeScript", "JavaScript"]
      }
    },
    "metrics": {
      "version": 1,
      "schema": "repository-metrics-mvp",
      "generatedAt": "2024-01-01T00:00:00.000Z",
      "indexCommit": "abc123...",
      "structure": {
        "totalFiles": 100,
        "totalLines": 5000,
        "folders": [
          {
            "path": "src/",
            "files": 50,
            "lines": 3000
          }
        ]
      },
      "languages": [
        {
          "ext": ".ts",
          "files": 40,
          "lines": 4000
        }
      ],
      "relations": {
        "mostImported": [
          {
            "path": "src/utils.ts",
            "importedByCount": 20
          }
        ],
        "mostImports": [
          {
            "path": "src/app.ts",
            "importsCount": 15
          }
        ]
      },
      "entrypoints": [
        {
          "path": "src/app.ts",
          "reason": "filename"
        }
      ]
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

---

## Ejemplo de Response (200 OK)

```json
{
  "answer": "Fuentes:\nsrc/auth.ts\n\nRespuesta:\nLa autenticación en este proyecto funciona mediante Firebase Auth. El componente principal es el servicio de autenticación ubicado en `src/auth.ts`. Utiliza tokens JWT y maneja sesiones mediante cookies seguras.\n\nMejoras / Riesgos:\n- Considerar implementar rate limiting para prevenir ataques de fuerza bruta\n- Validar tokens en cada request para mayor seguridad\n\nFalta contexto:\n- Información sobre configuración de Firebase\n- Detalles sobre manejo de sesiones",
  "files": [
    {
      "path": "src/auth.ts",
      "name": "auth.ts"
    }
  ],
  "findings": {
    "improvements": [
      "Considerar implementar rate limiting para prevenir ataques de fuerza bruta",
      "Validar tokens en cada request para mayor seguridad"
    ],
    "risks": []
  },
  "debug": {
    "engine": "ollama",
    "model": "phi3:mini",
    "location": "local",
    "latency": 1.2,
    "retrievalTime": 0.3,
    "generationTime": 0.9
  },
  "timestamp": "2024-01-01T12:00:10.000Z"
}
```

---

## Ejemplo de Response con Error (400 Bad Request)

```json
{
  "error": "question es requerida y no puede estar vacía"
}
```

---

## Ejemplo de Response con Error (503 Service Unavailable)

```json
{
  "error": "Ollama no está disponible. Asegúrate de que Ollama esté ejecutándose en http://localhost:11434 y que el modelo esté instalado.",
  "details": "fetch failed"
}
```

---

## Códigos de Estado HTTP

- **200 OK**: Query procesada exitosamente
- **400 Bad Request**: Request inválido (falta `question`, `repositoryId`, `context.index`, etc.)
- **500 Internal Server Error**: Error en ControlRepo (LLM falló, RAG falló, etc.)
- **503 Service Unavailable**: Ollama no está disponible

---

## Notas de Implementación

1. **Contexto completo**: El endpoint espera recibir el contexto completo del repositorio (índice, Project Brain, métricas) en el request. No carga datos desde filesystem.

2. **Búsqueda de archivos**: Reutiliza la función `searchFiles` existente para encontrar archivos relevantes según la pregunta.

3. **Construcción de prompt**: Reutiliza `getSystemPrompt` para construir el prompt completo con contexto, Project Brain y métricas.

4. **Llamada a Ollama**: Realiza la llamada a Ollama local en `http://localhost:11434/api/generate`.

5. **Extracción de fuentes**: Extrae automáticamente las fuentes mencionadas en la respuesta del LLM y las valida contra el índice recibido.

6. **Hallazgos**: Extrae mejoras y riesgos mencionados en la respuesta del LLM.

7. **Debug**: Incluye información de debug (engine, model, location, latency) si `includeDebug` es `true` (por defecto).

---

## Seguridad

⚠️ **IMPORTANTE**: Este endpoint NO debe exponerse públicamente. Considera:

1. **Validación de origen**: Implementar validación mediante header `X-ControlFile-Signature` (futuro)
2. **Red privada**: En producción, usar red privada/VPN para comunicación entre ControlFile y ControlRepo
3. **Firewall**: Bloquear acceso externo a `/internal/*` en el firewall
4. **Rate limiting**: Implementar rate limiting a nivel de infraestructura

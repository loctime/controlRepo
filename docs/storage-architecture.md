# Arquitectura de Almacenamiento

## Visión General

El sistema utiliza una arquitectura distribuida donde:
- **Frontend (Vercel)**: Interfaz de usuario y proxies de API
- **Backend de Indexación (Render - ControlFile)**: Procesamiento y almacenamiento de índices

## Ubicación de los Datos

### Índices de Repositorio

**Ubicación física**: Sistema de archivos del backend de Render
- **Ruta**: `/opt/render/project/src/backend/indexes/`
- **Formato**: `{repositoryId}.json` (ej: `github:loctime:scheduler.json`)
- **Contenido**: `RepositoryIndex` completo con metadata, archivos, relaciones, etc.

**Acceso desde Frontend**:
- **Endpoint**: `GET /api/repository/status?owner={owner}&repo={repo}&branch={branch}`
- **Implementación**: Proxy que consulta `{CONTROLFILE_URL}/api/repository/status`
- **Flujo**: Frontend (Vercel) → Proxy → Backend (Render) → Filesystem

### Métricas de Repositorio

**Ubicación física**: Sistema de archivos del backend de Render
- **Ruta**: `/opt/render/project/src/backend/metrics/`
- **Formato**: `{repositoryId}.json` (ej: `github:loctime:scheduler.json`)
- **Contenido**: `RepositoryMetrics` con estadísticas, lenguajes, estructura, etc.

**Acceso desde Frontend**:
- **Endpoint**: `GET /api/repository/metrics?owner={owner}&repo={repo}&branch={branch}`
- **Implementación**: Proxy que consulta `{CONTROLFILE_URL}/api/repository/metrics`
- **Flujo**: Frontend (Vercel) → Proxy → Backend (Render) → Filesystem

### Project Brain

**Ubicación física**: Sistema de archivos del backend de Render
- **Ruta**: `/opt/render/project/src/backend/project-brains/`
- **Formato**: `{repositoryId}.json`
- **Contenido**: Análisis de alto nivel del proyecto

**Acceso**: Actualmente solo desde el backend durante el chat

### Preferencias de Usuario

**Ubicación**: Firestore
- **Namespace**: `/apps/controlrepo/{userId}/preferences`
- **Contenido**: `activeRepositoryId`, `updatedAt`
- **Acceso**: Directo desde Vercel usando Firebase Admin SDK

### Locks de Indexación

**Ubicación física**: Sistema de archivos del backend de Render
- **Ruta**: `/opt/render/project/src/backend/locks/`
- **Formato**: `{repositoryId}.lock`
- **Propósito**: Prevenir indexaciones simultáneas del mismo repositorio

## Flujo de Datos

### Indexación

```
1. Frontend (Vercel)
   POST /api/repository/index
   ↓
2. Proxy en Vercel
   POST {CONTROLFILE_URL}/api/repository/index
   ↓
3. Backend (Render)
   - Adquiere lock
   - Inicia indexación en background
   - Guarda índice en filesystem
   - Guarda métricas en filesystem
   - Libera lock
   ↓
4. Retorna 202 Accepted
```

### Consulta de Estado

```
1. Frontend (Vercel)
   GET /api/repository/status?owner=X&repo=Y&branch=Z
   ↓
2. Proxy en Vercel
   GET {CONTROLFILE_URL}/api/repository/status?owner=X&repo=Y&branch=Z
   ↓
3. Backend (Render)
   - Lee índice desde filesystem
   - Retorna RepositoryIndex completo
   ↓
4. Frontend recibe datos y actualiza UI
```

### Consulta de Métricas

```
1. Frontend (Vercel)
   GET /api/repository/metrics?owner=X&repo=Y&branch=Z
   ↓
2. Proxy en Vercel
   GET {CONTROLFILE_URL}/api/repository/metrics?owner=X&repo=Y&branch=Z
   ↓
3. Backend (Render)
   - Lee métricas desde filesystem
   - Retorna RepositoryMetrics
   ↓
4. Frontend muestra métricas en sidebar
```

## Variables de Entorno

### Frontend (Vercel)

- `CONTROLFILE_URL` o `NEXT_PUBLIC_CONTROLFILE_URL`: URL del backend de Render
  - Ejemplo: `https://controlfile-backend.onrender.com`

### Backend (Render)

- `FIREBASE_SERVICE_ACCOUNT_KEY`: Credenciales de Firebase Admin SDK
- Variables de GitHub API (si aplica)

## Estructura de Archivos JSON

### RepositoryIndex (`{repositoryId}.json`)

```json
{
  "id": "github:owner:repo",
  "owner": "owner",
  "repo": "repo",
  "branch": "main",
  "status": "completed",
  "indexedAt": "2024-01-01T00:00:00.000Z",
  "lastCommit": "abc123...",
  "metadata": { ... },
  "files": [ ... ],
  "keyFiles": { ... },
  "summary": { ... }
}
```

### RepositoryMetrics (`{repositoryId}.json`)

```json
{
  "repositoryId": "github:owner:repo",
  "structure": { ... },
  "languages": [ ... ],
  "relations": { ... },
  "entrypoints": [ ... ]
}
```

## Notas Importantes

1. **Separación de responsabilidades**: 
   - Vercel NO escribe en filesystem (solo lee vía proxy)
   - Render es el único que escribe índices y métricas

2. **Persistencia**:
   - Los archivos en Render persisten entre deployments
   - Los locks se limpian automáticamente si expiran

3. **Escalabilidad**:
   - Si se necesita escalar, considerar migrar a Firestore o S3
   - Actualmente funciona bien para un solo backend de Render

4. **Debugging**:
   - Los logs del backend muestran rutas exactas de archivos
   - Los logs del frontend muestran las URLs de proxy utilizadas

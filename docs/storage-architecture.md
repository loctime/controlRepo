# Arquitectura de Almacenamiento (Local)

## Visión General

El sistema funciona 100% en local y persiste datos en el filesystem del mismo proceso
que ejecuta ControlRepo.

## Ubicación de los Datos

### Índices de Repositorio

- **Ubicación física**: `.repository-indexes/`
- **Formato**: `{repositoryId}.json` (ej: `github_owner_repo_main.json`)
- **Contenido**: `RepositoryIndex` completo con metadata, archivos, relaciones, etc.

### Métricas de Repositorio

- **Ubicación física**: `.repository-indexes/{repositoryId}/metrics.json`
- **Contenido**: `RepositoryMetrics` con estadísticas, lenguajes y estructura

### Project Brain

- **Ubicación física**: `.repository-indexes/{repositoryId}/project-brain.json`
- **Contenido**: resumen de alto nivel del proyecto

### Locks de Indexación

- **Ubicación física**: `.repository-locks/`
- **Formato**: `{repositoryId}.json`
- **Propósito**: prevenir indexaciones simultáneas

## Flujo de Datos

### Indexación

```
1. Frontend local
   POST /api/repository/index
   ↓
2. Backend local
   - Adquiere lock
   - Indexa repositorio
   - Guarda índice, métricas y project brain
   - Libera lock
   ↓
3. Retorna 202 Accepted
```

### Consulta de Estado

```
1. Frontend local
   GET /api/repository/status?repositoryId=github:owner:repo
   ↓
2. Backend local
   - Lee índice desde filesystem
   - Retorna status y stats
```

### Métricas

```
1. Frontend local
   GET /api/repository/metrics?owner=owner&repo=repo
   ↓
2. Backend local
   - Lee métricas desde filesystem
```

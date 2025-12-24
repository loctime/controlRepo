# Sistema de Indexación de Repositorios

## Descripción

Sistema para indexar repositorios de GitHub y generar un índice estructurado con metadata, resúmenes y relaciones entre archivos. **No incluye contenido crudo**, solo información procesada.

## Endpoints

### POST `/api/repository/index`

Indexa un repositorio completo por primera vez.

**Body:**
```json
{
  "owner": "usuario",
  "repo": "nombre-repo",
  "branch": "main" // opcional, default: "main"
}
```

**Response (202 Accepted):**
```json
{
  "status": "indexing",
  "repositoryId": "usuario/nombre-repo",
  "message": "Indexación iniciada"
}
```

**Errores:**
- `400`: Parámetros faltantes
- `409`: El repositorio ya está siendo indexado
- `500`: Error del servidor

### POST `/api/repository/reindex`

Re-indexa un repositorio existente (fuerza re-indexación).

**Body:**
```json
{
  "owner": "usuario",
  "repo": "nombre-repo",
  "branch": "main" // opcional
}
```

**Response (202 Accepted):**
```json
{
  "status": "indexing",
  "repositoryId": "usuario/nombre-repo",
  "message": "Re-indexación iniciada"
}
```

**Errores:**
- `400`: Parámetros faltantes
- `404`: No existe un índice previo
- `409`: El repositorio ya está siendo indexado
- `500`: Error del servidor

### GET `/api/repository/status`

Obtiene el estado e índice completo de un repositorio.

**Query Parameters:**
- `owner` (requerido): Propietario del repositorio
- `repo` (requerido): Nombre del repositorio
- `branch` (opcional): Rama del repositorio

**Response (200 OK):**
```json
{
  "id": "usuario/nombre-repo",
  "owner": "usuario",
  "repo": "nombre-repo",
  "branch": "main",
  "defaultBranch": "main",
  "status": "completed",
  "indexedAt": "2024-01-01T00:00:00.000Z",
  "lastCommit": "abc123...",
  "metadata": { ... },
  "files": [ ... ],
  "keyFiles": { ... },
  "summary": { ... }
}
```

**Errores:**
- `400`: Parámetros faltantes
- `404`: Índice no encontrado
- `500`: Error del servidor

## Modelo de Datos

Ver `lib/types/repository.ts` para la definición completa de tipos.

### Estructura Principal

- **RepositoryIndex**: Contiene toda la información del repositorio indexado
- **IndexedFile**: Metadata de cada archivo (sin contenido crudo)
- **FileCategory**: Categoría del archivo (component, hook, service, etc.)
- **FileType**: Tipo específico del archivo (component-tsx, readme, etc.)

## Sistema de Locking

- Los locks previenen indexaciones simultáneas del mismo repositorio
- Los locks expiran automáticamente después de 30 minutos
- Si un lock expiró, se puede adquirir uno nuevo

## Persistencia

Los índices se guardan en el sistema de archivos local:
- `.repository-indexes/`: Índices guardados
- `.repository-locks/`: Locks activos

Estos directorios están en `.gitignore` y no se versionan.

## Variables de Entorno

- `GITHUB_TOKEN`: Token de GitHub para autenticación (requerido)

## Flujo de Indexación

1. Cliente llama a `/index` o `/reindex`
2. API adquiere lock (o retorna 409 si está bloqueado)
3. API inicia indexación en background
4. Indexación:
   - Obtiene árbol completo del repositorio
   - Identifica archivos clave
   - Procesa archivos clave con contenido completo
   - Procesa resto de archivos solo con metadata
   - Extrae relaciones (imports/importedBy)
   - Calcula resumen general
5. Guarda índice en persistencia
6. Libera lock
7. Cliente puede consultar `/status` para obtener el índice completo

## Notas

- La indexación es asíncrona y se ejecuta en background
- El endpoint retorna inmediatamente con status "indexing"
- Usa `/status` para verificar cuando la indexación completa
- Los archivos clave (README, package.json, etc.) se procesan con contenido completo para análisis
- El resto de archivos solo incluyen metadata básica


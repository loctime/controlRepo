# Persistencia de Datos

## Separación de Responsabilidades

El sistema maneja tres tipos de datos persistentes que deben mantenerse completamente separados:

```
┌─────────────────────────────────────────────────────────────┐
│                    CONTROLREPO STORAGE                     │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌──────────────────────────────────────────────────────┐  │
│  │  1. REPOSITORIO INDEXADO                             │  │
│  │     Ubicación: .repository-indexes/                  │  │
│  │     Pertenencia: Por usuario                         │  │
│  │     Contenido: Metadata del repositorio              │  │
│  │     Actualización: Solo durante indexación          │  │
│  └──────────────────────────────────────────────────────┘  │
│                                                             │
│  ┌──────────────────────────────────────────────────────┐  │
│  │  2. PROJECT BRAIN                                   │  │
│  │     Ubicación: .project-brains/{repositoryId}/      │  │
│  │     Pertenencia: Al repositorio (compartido)         │  │
│  │     Contenido: Conocimiento arquitectónico          │  │
│  │     Actualización: Gradual (insights)               │  │
│  │     ⚠️ NO contiene historial de conversaciones      │  │
│  └──────────────────────────────────────────────────────┘  │
│                                                             │
│  ┌──────────────────────────────────────────────────────┐  │
│  │  3. CHAT HISTORY                                     │  │
│  │     Ubicación: .chat-history/{userId}/{repoId}/      │  │
│  │     Pertenencia: Por usuario + repositorio (privado) │  │
│  │     Contenido: Mensajes de conversación             │  │
│  │     Actualización: Cada mensaje                     │  │
│  │     ⚠️ NO forma parte del Project Brain              │  │
│  │     ⚠️ NO modifica arquitectura                     │  │
│  └──────────────────────────────────────────────────────┘  │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

## 1. Repositorio Indexado

**Propósito**: Metadata del repositorio indexado (estructura, archivos, relaciones)

**Pertenencia**: Por usuario (cada usuario puede tener múltiples repositorios indexados)

**Ubicación**: Storage interno de ControlRepo (`.repository-indexes/`)

**Contenido**:
- Estructura de archivos del repositorio
- Metadata de cada archivo (sin contenido crudo)
- Relaciones entre archivos (imports, dependencias)
- Resumen del repositorio (lenguajes, categorías, estadísticas)

**Características**:
- Se crea durante la indexación del repositorio
- Se actualiza cuando se re-indexa
- NO contiene contenido de archivos (solo metadata)
- NO se modifica durante las conversaciones

**Estructura**: Ver `lib/types/repository.ts` → `RepositoryIndex`

## 2. Project Brain

**Propósito**: Conocimiento acumulado sobre el repositorio (arquitectura, decisiones, contexto global)

**Pertenencia**: Al repositorio (no al usuario ni a la conversación)

**Ubicación**: Storage interno de ControlRepo (`.project-brains/{repositoryId}/`)

**Contenido**:
- Arquitectura del proyecto (extraída de conversaciones y análisis)
- Decisiones de diseño documentadas
- Patrones identificados
- Contexto global del proyecto
- Insights acumulados sobre el código

**Características**:
- Se construye gradualmente a partir de conversaciones
- Pertenece al repositorio, no a conversaciones individuales
- Se comparte entre todos los usuarios que consultan el mismo repositorio
- Se actualiza cuando se identifican nuevos insights arquitectónicos
- NO contiene historial de conversaciones
- NO se modifica directamente por el usuario

**Estructura**: Ver `lib/types/project-brain.ts` → `ProjectBrain`

**Nota**: El Project Brain es una representación evolutiva del conocimiento sobre el repositorio. No es un chat history, sino un "cerebro" que acumula conocimiento arquitectónico.

## 3. Chat History (Historial de Conversaciones)

**Propósito**: Historial de conversaciones entre usuario y asistente sobre un repositorio

**Pertenencia**: Por usuario + repositorio (cada usuario tiene su propio historial por repositorio)

**Ubicación**: Storage interno de ControlRepo (`.chat-history/{userId}/{repositoryId}/`)

**Contenido**:
- Mensajes de usuario y asistente
- Timestamps de cada mensaje
- Archivos usados como contexto en cada respuesta
- Intenciones detectadas
- Hallazgos mencionados (mejoras, riesgos)

**Características**:
- Se guarda por usuario y repositorio
- NO forma parte del Project Brain
- NO modifica arquitectura ni contexto global
- Es privado para cada usuario
- Se puede limpiar/eliminar sin afectar el Project Brain

**Estructura**: Ver `lib/types/chat-history.ts` → `ChatHistory`, `ChatMessage`

## Reglas de Separación

### ✅ CORRECTO

- El Project Brain se actualiza cuando se identifican insights arquitectónicos
- El Chat History se guarda por usuario + repo
- El índice del repositorio se actualiza solo durante indexación/re-indexación
- Cada usuario tiene su propio historial de conversaciones

### ❌ INCORRECTO

- Guardar mensajes de chat en el Project Brain
- Modificar el índice del repositorio durante conversaciones
- Compartir historial de chat entre usuarios
- Incluir Project Brain en el historial de conversaciones

## Flujo de Datos

```
Usuario pregunta sobre repositorio
    ↓
Chat History: Se guarda pregunta + respuesta
    ↓
Project Brain: Se extraen insights arquitectónicos (si aplica)
    ↓
Repository Index: Se usa para buscar archivos relevantes (solo lectura)
```

## Implementación

### Storage de Repositorio Indexado
- **Archivo**: `lib/repository/storage-filesystem.ts`
- **Directorio**: `.repository-indexes/`
- **Formato**: JSON por repositorio

### Storage de Project Brain
- **Archivo**: `lib/project-brain/storage.ts` (por implementar)
- **Directorio**: `.project-brains/{repositoryId}/`
- **Formato**: JSON estructurado

### Storage de Chat History
- **Archivo**: `lib/chat-history/storage.ts` (por implementar)
- **Directorio**: `.chat-history/{userId}/{repositoryId}/`
- **Formato**: JSON con array de mensajes

## Notas Importantes

1. **El Project Brain pertenece al repositorio**: Si dos usuarios consultan el mismo repositorio, comparten el mismo Project Brain pero tienen historiales de chat separados.

2. **El Chat History es privado**: Cada usuario tiene su propio historial por repositorio. No se comparte entre usuarios.

3. **El índice del repositorio es compartido**: Todos los usuarios que consultan el mismo repositorio usan el mismo índice.

4. **Separación estricta**: Estos tres tipos de datos nunca deben mezclarse. El Project Brain no contiene mensajes de chat, y el Chat History no contiene conocimiento arquitectónico persistente.


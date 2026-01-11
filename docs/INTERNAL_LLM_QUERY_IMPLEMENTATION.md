# Implementación del Endpoint Interno /internal/llm/query

## ✅ Estado: Implementado

Fecha de implementación: 2024-01-XX

---

## 📁 Archivos Creados/Modificados

### Nuevos Archivos

1. **`app/api/internal/llm/query/route.ts`**
   - Endpoint interno POST `/internal/llm/query`
   - Implementa toda la lógica de procesamiento de queries LLM
   - Reutiliza funciones existentes de búsqueda, construcción de prompt y llamada a Ollama

2. **`lib/types/internal-llm-query.ts`**
   - Tipos TypeScript para request y response del endpoint interno
   - `InternalLLMQueryRequest`: Contrato del request
   - `InternalLLMQueryResponse`: Contrato del response

3. **`docs/INTERNAL_LLM_QUERY_EXAMPLES.md`**
   - Documentación con ejemplos de uso
   - Ejemplos de request y response
   - Códigos de estado HTTP
   - Notas de seguridad

4. **`docs/INTERNAL_LLM_QUERY_IMPLEMENTATION.md`** (este archivo)
   - Resumen de la implementación
   - Checklist de funcionalidades

---

## ✅ Funcionalidades Implementadas

### 1. Validación del Request
- ✅ Valida `question` (requerido, no vacío)
- ✅ Valida `repositoryId` (requerido)
- ✅ Valida `context.index` (requerido)
- ✅ Valida `context.index.files` (debe ser array)
- ✅ Valida que el índice tenga archivos

### 2. Reutilización de Lógica Existente
- ✅ Reutiliza `searchFiles` para búsqueda de archivos relevantes
- ✅ Reutiliza `getSystemPrompt` para construcción de prompt
- ✅ Reutiliza funciones de limpieza y formateo de respuesta
- ✅ Reutiliza funciones de extracción de fuentes y hallazgos

### 3. Procesamiento de Contexto
- ✅ Trabaja con contexto recibido en el request (no carga desde filesystem)
- ✅ Construye contexto con metadata de archivos relevantes
- ✅ Incluye Project Brain si está disponible
- ✅ Incluye métricas si están disponibles

### 4. Llamada a Ollama
- ✅ Realiza llamada a Ollama local (`http://localhost:11434/api/generate`)
- ✅ Soporta configuración de modelo (`phi3:mini` por defecto)
- ✅ Maneja errores de Ollama (503 Service Unavailable)
- ✅ Mide tiempos de retrieval y generación

### 5. Procesamiento de Respuesta
- ✅ Limpia razonamiento interno de la respuesta
- ✅ Extrae fuentes mencionadas en la respuesta
- ✅ Valida que las fuentes existan en el índice
- ✅ Formatea respuesta según estándar (Fuentes, Respuesta, Mejoras/Riesgos, etc.)
- ✅ Extrae hallazgos (mejoras y riesgos)

### 6. Respuesta Estructurada
- ✅ Retorna `answer` (respuesta formateada)
- ✅ Retorna `files` (archivos citados con path y name)
- ✅ Retorna `findings` (mejoras y riesgos si existen)
- ✅ Retorna `debug` (engine, model, location, latency) si `includeDebug: true`
- ✅ Retorna `timestamp` (ISO 8601)

### 7. Manejo de Casos Especiales
- ✅ Detecta intenciones sociales (saludos, confirmaciones)
- ✅ Procesa respuestas sociales sin formato técnico
- ✅ Maneja preguntas generales/exploratorias buscando documentación
- ✅ Valida y descarta fuentes inválidas

### 8. Seguridad
- ✅ Endpoint NO público (ruta `/internal/*`)
- ✅ NO valida autenticación de usuario final
- ✅ Documentación de seguridad incluida

---

## 🔄 Flujo de Ejecución

1. **Validación**: Valida request según contrato
2. **Búsqueda**: Busca archivos relevantes usando `searchFiles`
3. **Construcción de contexto**: Construye contexto con metadata de archivos, Project Brain y métricas
4. **Construcción de prompt**: Usa `getSystemPrompt` con contexto completo
5. **Llamada a Ollama**: Realiza llamada a Ollama local
6. **Procesamiento**: Limpia respuesta, extrae fuentes y hallazgos
7. **Validación de fuentes**: Valida que las fuentes existan en el índice
8. **Formateo**: Formatea respuesta según estándar
9. **Respuesta**: Retorna respuesta estructurada con debug opcional

---

## 🧪 Pruebas Recomendadas

### Pruebas Unitarias (Futuro)
- [ ] Validación de request
- [ ] Búsqueda de archivos relevantes
- [ ] Extracción de fuentes
- [ ] Extracción de hallazgos
- [ ] Formateo de respuesta

### Pruebas de Integración (Futuro)
- [ ] Llamada completa al endpoint con contexto válido
- [ ] Manejo de errores de Ollama
- [ ] Validación de fuentes inválidas
- [ ] Respuestas sociales vs técnicas

### Pruebas Manuales
- [ ] Llamar al endpoint con request válido
- [ ] Verificar respuesta estructurada
- [ ] Verificar debug info
- [ ] Verificar manejo de errores

---

## 📝 Notas de Implementación

1. **Contexto completo**: El endpoint espera recibir el contexto completo en el request. No carga datos desde filesystem, lo que permite desacoplar ControlFile de ControlRepo.

2. **Reutilización**: Se reutiliza toda la lógica existente de `/api/chat/route.ts`, adaptándola para trabajar con contexto recibido en lugar de cargado desde filesystem.

3. **Compatibilidad**: El código es compatible con la estructura existente y reutiliza funciones auxiliares existentes.

4. **Extensibilidad**: El código está preparado para futuros motores cloud (aunque actualmente solo soporta Ollama local).

5. **Debug**: Por defecto incluye información de debug, pero puede desactivarse con `includeDebug: false`.

---

## 🚀 Próximos Pasos (Futuro)

1. **Validación de origen**: Implementar validación mediante header `X-ControlFile-Signature`
2. **Soporte para motores cloud**: Extender para soportar OpenAI, Anthropic, etc.
3. **Optimización de contexto**: Implementar modo "references" para repositorios grandes
4. **Rate limiting**: Implementar rate limiting a nivel de infraestructura
5. **Tests**: Agregar tests unitarios y de integración
6. **Logging**: Mejorar logging para debugging y monitoreo

---

## 📚 Referencias

- Diseño del flujo: `docs/DISENO_CHAT_FLOW.md`
- Ejemplos de uso: `docs/INTERNAL_LLM_QUERY_EXAMPLES.md`
- Contrato API: `docs/CONTRATO-API.md`
- Implementación existente: `app/api/chat/route.ts`

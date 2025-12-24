# Limitaciones actuales

- No hay embeddings ni búsqueda semántica avanzada
- La búsqueda de archivos relevantes es basada en texto simple (no vectorial)
- Requiere Ollama ejecutándose localmente en http://localhost:11434
- El modelo usado es phi3:mini (debe estar instalado en Ollama)
- Los índices se almacenan localmente en el sistema de archivos

## Notas sobre funcionalidad actual

- ✅ El indexado de repositorios SÍ está implementado
- ✅ Las respuestas del chat usan Ollama (no son simuladas)
- ✅ Los archivos de contexto son reales y provienen del índice
- ✅ La búsqueda de archivos relevantes funciona con metadata del índice

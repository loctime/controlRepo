# Decisiones de diseño

## Contexto explícito
Se decidió mostrar siempre los archivos usados para evitar:
- Alucinaciones
- Suposiciones implícitas
- Respuestas opacas

## Chat desacoplado
El chat no accede al repositorio directamente para:
- Evitar lógica oculta
- Facilitar reemplazo futuro del backend
- Mantener UI pura

## Sidebar estática
La documentación base es estática para:
- Garantizar consistencia
- Evitar dependencias externas
- Servir como fallback si el chat falla

## No edición de código
El sistema es deliberadamente de solo lectura.

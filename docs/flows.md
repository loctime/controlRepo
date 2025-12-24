# Flujos del sistema

## Flujo de navegación
1. Usuario accede a la aplicación
2. Visualiza sidebar con secciones
3. Explora documentación pasiva
4. Puede alternar entre secciones

## Flujo de consulta (chat)
1. Usuario escribe una pregunta
2. El mensaje se renderiza en el chat
3. El sistema busca archivos relevantes en el índice del repositorio
4. Se construye un contexto con metadata de los archivos encontrados
5. Se envía el contexto y la pregunta a Ollama (phi3:mini)
6. Ollama genera una respuesta basada en el contexto
7. Se muestran los archivos de contexto utilizados en ContextPanel

## Flujo de contexto
1. ContextPanel permanece oculto
2. Usuario lo despliega
3. Visualiza lista de archivos usados
4. No hay inferencias adicionales

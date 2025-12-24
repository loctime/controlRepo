# Arquitectura del sistema

## Visión general
El sistema está diseñado como una aplicación de lectura y consulta documental.
No existe lógica de negocio acoplada al repositorio ni acceso directo a archivos reales.

Toda la arquitectura prioriza:
- Claridad
- Separación de responsabilidades
- Evolución futura sin romper contratos

## Capas del sistema

### 1. Layout
Responsable de:
- Header (con información del repositorio activo)
- Sidebar
- Área principal de contenido

Archivo principal:
- AppLayout

Componentes relacionados:
- HeaderRepository (muestra repositorio activo y estado de indexación)
- AuthWrapper (maneja autenticación y renderiza AppLayout)

### 2. Navegación documental
Responsable de:
- Mostrar secciones (Arquitectura, Módulos, Flujos)
- Navegación pasiva (solo lectura)

Componentes:
- SidebarDocs
- SidebarPanel

### 3. Chat
Responsable de:
- Interfaz conversacional
- Render de mensajes
- Entrada de usuario
- Envío de preguntas al backend

Componentes:
- ChatPanel
- ChatInterface

⚠️ El chat NO decide qué archivos usar (eso lo hace el backend).
⚠️ El chat solo pasa la pregunta y el repositoryId al backend.
⚠️ El backend (`/api/chat`) es quien busca archivos relevantes y genera la respuesta.

### 4. Contexto
Responsable de:
- Mostrar archivos usados como contexto
- Explicitar origen de la información

Componente:
- ContextPanel

### 5. Autenticación
Responsable de:
- Manejo de sesión de usuario
- Protección de rutas

Componentes:
- AuthWrapper
- LoginForm
- LogoutButton

## 6. Persistencia de Datos

El sistema maneja tres tipos de datos persistentes completamente separados:

### Repositorio Indexado
- **Ubicación**: `.repository-indexes/`
- **Contenido**: Metadata del repositorio (estructura, archivos, relaciones)
- **Pertenencia**: Por usuario (cada usuario puede tener múltiples repositorios indexados)
- **Actualización**: Solo durante indexación/re-indexación

### Project Brain
- **Ubicación**: `.project-brains/{repositoryId}/`
- **Contenido**: Conocimiento acumulado sobre el repositorio (arquitectura, decisiones, contexto global)
- **Pertenencia**: Al repositorio (compartido entre usuarios que consultan el mismo repo)
- **Actualización**: Se construye gradualmente a partir de insights arquitectónicos
- **Importante**: NO contiene historial de conversaciones

### Chat History
- **Ubicación**: `.chat-history/{userId}/{repositoryId}/`
- **Contenido**: Historial de conversaciones entre usuario y asistente
- **Pertenencia**: Por usuario + repositorio (privado para cada usuario)
- **Actualización**: Se guarda cada mensaje de la conversación
- **Importante**: NO forma parte del Project Brain, NO modifica arquitectura

Ver `docs/persistence.md` para detalles completos sobre la separación de persistencia.

## Principio clave
Ningún componente tiene conocimiento global del sistema.
Todo se comunica por composición visual, no por lógica compartida.

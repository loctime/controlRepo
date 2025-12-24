# Módulos del sistema

## AppLayout
Responsabilidad:
- Estructura general de la aplicación
- Header
- Sidebar
- Contenedor principal

## HeaderRepository
Responsabilidad:
- Mostrar repositorio activo y su estado
- Permitir cambiar de rama
- Iniciar indexación de nuevos repositorios
- Integrado en el header de AppLayout

## SidebarDocs
Responsabilidad:
- Wrapper del panel documental
- Aislar navegación del resto del sistema

## SidebarPanel
Responsabilidad:
- Tabs de Arquitectura, Módulos y Flujos
- Contenido explicativo estático

## ChatPanel
Responsabilidad:
- Contenedor del chat
- Separar layout del contenido conversacional

## ChatInterface
Responsabilidad:
- Manejar mensajes
- Renderizar conversación
- Mostrar ContextPanel
- Manejar input del usuario

No accede a archivos reales.

## ContextPanel
Responsabilidad:
- Mostrar archivos usados como contexto
- No analiza ni decide
- UI pura

## AuthWrapper
Responsabilidad:
- Verificar autenticación del usuario
- Renderizar LoginForm si no hay sesión
- Renderizar AppLayout si hay sesión activa
- Manejar estados de carga

## LoginForm / LogoutButton
Responsabilidad:
- Autenticación de usuarios
- Cierre de sesión
- No afecta lógica del repositorio

## ThemeProvider / ThemeToggle
Responsabilidad:
- Manejo de tema claro/oscuro
- No afecta lógica del sistema

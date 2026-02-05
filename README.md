# ControlRepo

## 🎯 Objetivo del proyecto
ControlRepo es una aplicación de documentación interactiva para repositorios de código.
Permite explorar arquitectura, módulos y flujos de un proyecto mediante una interfaz de chat,
mostrando explícitamente los archivos utilizados como contexto para cada respuesta.

El objetivo principal es servir como:
- Wikipedia técnica del repositorio
- Asistente de onboarding para desarrolladores
- Herramienta de consulta estructural sin modificar código

## 🧠 Qué hace el sistema
- Presenta una UI de documentación basada en componentes
- Provee un chat de consulta sobre el proyecto
- Muestra de forma explícita los archivos usados como contexto
- Organiza la información en arquitectura, módulos y flujos

## ❌ Qué NO hace
- No modifica código
- No ejecuta análisis estático
- No infiere información inexistente
- No responde sin contexto verificable

## 🧱 Arquitectura general
- Frontend: Next.js (App Router)
- UI: Componentes React + UI components
- Navegación documental mediante sidebar
- Chat desacoplado de la lógica del repositorio

## 📁 Documentación
Toda la documentación técnica se encuentra en la carpeta `/docs`:

- architecture.md - Arquitectura general del sistema
- persistence.md - **Separación de persistencia (Repositorio Indexado, Project Brain, Chat History)**
- modules.md - Módulos del sistema
- flows.md - Flujos principales
- decisions.md - Decisiones de diseño
- limitations.md - Limitaciones conocidas
- roadmap.md - Roadmap del proyecto

## 🔒 Principios del sistema
- Transparencia total del contexto
- Separación estricta de responsabilidades
- Diseño anti-alucinación
- Lectura y consulta únicamente
- **Separación clara de persistencia**: Repositorio Indexado, Project Brain y Chat History son entidades completamente independientes

## 🚧 Estado actual
- ✅ UI base completa
- ✅ Chat funcional con Ollama (phi3:mini)
- ✅ ContextPanel implementado
- ✅ Sidebar documental funcional
- ✅ Sistema de indexado de repositorios implementado
- ✅ Búsqueda de archivos relevantes basada en metadata
- ✅ Integración con GitHub API para indexación

## 🔧 Requisitos (modo local)
- Node.js + pnpm
- Ollama ejecutándose en http://localhost:11434
- Modelo `phi3:mini` instalado en Ollama
- (Opcional) `GITHUB_TOKEN` para repos privados o límites de rate de GitHub

## ▶️ Cómo correr ControlRepo en local
1. Iniciar Ollama:
   ```bash
   ollama serve
   ```
2. Instalar dependencias:
   ```bash
   pnpm install
   ```
3. (Opcional) Exportar token de GitHub:
   ```bash
   export GITHUB_TOKEN="tu_token"
   ```
4. Levantar la app:
   ```bash
   pnpm dev
   ```

## 🔁 Flujo local completo
1. Abrir la app en `http://localhost:3000`.
2. Pegar la URL del repo de GitHub y indexar.
3. Esperar a que el status sea **completed**.
4. Chatear con el repositorio usando Ollama local.

## ✅ Modo local sin cloud
- No usa Render, Vercel, Cloudflare ni túneles.
- No usa GitHub OAuth: la indexación usa acceso público y, si hace falta, `GITHUB_TOKEN`.
- Todos los índices, métricas y project brain se guardan en `.repository-indexes/`.

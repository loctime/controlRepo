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

- architecture.md
- modules.md
- flows.md
- decisions.md
- limitations.md
- roadmap.md

## 🔒 Principios del sistema
- Transparencia total del contexto
- Separación estricta de responsabilidades
- Diseño anti-alucinación
- Lectura y consulta únicamente

## 🚧 Estado actual
- ✅ UI base completa
- ✅ Chat funcional con Ollama (phi3:mini)
- ✅ ContextPanel implementado
- ✅ Sidebar documental funcional
- ✅ Sistema de indexado de repositorios implementado
- ✅ Búsqueda de archivos relevantes basada en metadata
- ✅ Integración con GitHub API para indexación

## 🔧 Requisitos
- Ollama ejecutándose en http://localhost:11434
- Modelo `phi3:mini` instalado en Ollama
- Token de GitHub configurado en variables de entorno (`GITHUB_TOKEN`)

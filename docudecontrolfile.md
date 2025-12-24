📘 README.md — Arquitectura de Integración
ControlAudit ↔ ControlFile

(Plantilla estándar para todas las apps Control*)

1. Propósito del documento

Este README NO es introductorio.
Este documento define reglas de arquitectura obligatorias.

Cualquier cambio de código que viole este documento se considera incorrecto, aunque “funcione”.

Este documento existe para:

IAs (Cursor, Copilot, ChatGPT)

nuevos desarrolladores

mantenimiento a largo plazo

evitar regresiones estructurales

2. Visión general del sistema
Apps involucradas
App	Responsabilidad
ControlAudit	Auditorías, formularios, respuestas, offline
ControlFile	Gestión de archivos, carpetas, permisos
Firebase Auth	Identidad
Firestore	Datos estructurados
Backblaze B2	Archivos binarios
3. Diagrama general (alto nivel)
Diagrama lógico
┌──────────────┐
│   Usuario    │
└──────┬───────┘
       │
       ▼
┌────────────────────┐
│  ControlAudit FE   │
│  (React / PWA)     │
└──────┬─────────────┘
       │ API HTTP
       ▼
┌────────────────────┐
│ ControlFile API    │
│ (Node / Express)   │
└──────┬─────────────┘
       │
       ▼
┌────────────────────┐
│ Backblaze B2       │
│ (Storage real)     │
└────────────────────┘

4. Diagrama de datos (Firestore)
Namespace obligatorio
/apps
 ├─ /auditoria
 │   └─ /users
 │       └─ {userId}
 │           ├─ empresas
 │           ├─ sucursales
 │           ├─ formularios
 │           ├─ auditorias
 │           └─ capacitaciones
 │
 └─ /controlfile
     ├─ files
     ├─ folders
     └─ permissions

Regla crítica

ControlAudit solo puede escribir en /apps/auditoria/**

5. Contrato de archivos (regla más importante)
❌ Prohibido

Firebase Storage

guardar blobs en Firestore

subir directo a Backblaze

manejar carpetas desde frontend

duplicar lógica de archivos

✅ Permitido

subir vía ControlFile API

guardar fileId, fileURL, metadata

referenciar archivos existentes

6. Modelo de archivo (contrato)
{
  "fileId": "cf_x93k2",
  "fileURL": "https://cdn.controlfile.com/auditoria/empresa123/img1.jpg",
  "name": "asistencia_enero.jpg",
  "size": 234567,
  "type": "image/jpeg",
  "uploadedAt": "ISO_DATE",
  "uploadedBy": "userId"
}


Este objeto es inmutable desde ControlAudit.

7. Flujo de subida (diagrama de secuencia)
Usuario
  │
  │ selecciona archivo
  ▼
ControlAudit FE
  │
  │ POST /controlfile/upload
  ▼
ControlFile API
  │
  │ upload → Backblaze
  ▼
Backblaze B2
  │
  │ devuelve URL
  ▼
ControlFile API
  │
  │ retorna metadata
  ▼
ControlAudit FE
  │
  │ guarda referencia en Firestore
  ▼
Firestore (/apps/auditoria)

8. Offline (regla especial)
Qué se guarda offline

respuestas

comentarios

referencias de archivos pendientes

Qué NO

archivos finales

URLs falsas

Regla

El archivo solo existe cuando ControlFile devuelve fileURL.

9. Inicialización de carpetas
Función única permitida
initializeControlFileFolders()


Reglas:

se ejecuta una sola vez

nunca crea duplicados

siempre reutiliza si existe

es tolerante a errores (no bloquea login)

10. Separación de responsabilidades (tabla final)
Área	ControlAudit	ControlFile
UX / UI	✅	❌
Auditorías	✅	❌
Formularios	✅	❌
Offline	✅	❌
Subida archivos	❌	✅
Storage	❌	✅
Carpetas	❌	✅
Seguridad archivos	❌	✅
11. Checklist obligatoria (para Cursor)

Antes de aceptar un cambio, verificar:

 ¿Escribe solo en /apps/auditoria?

 ¿No usa Firebase Storage?

 ¿No sube directo a Backblaze?

 ¿Usa ControlFile API para archivos?

 ¿Guarda solo metadata?

 ¿No duplica lógica de carpetas?

 ¿Respeta el modelo de archivo?

Si alguna respuesta es NO, el cambio es inválido.

12. Regla de oro (copiar textual)

ControlAudit gestiona información.
ControlFile gestiona archivos.
Nunca mezclar responsabilidades.

🧠 Prompt base para Cursor (USAR SIEMPRE)

Copiá esto y pegalo en Cursor:

Este proyecto sigue estrictamente la arquitectura documentada en README.md.
Antes de escribir código:
- Lee TODO el README
- Respeta separación ControlAudit / ControlFile
- No uses Firebase Storage
- No manejes archivos fuera de ControlFile
- No escribas fuera de /apps/auditoria

Si una solución viola el README, es incorrecta aunque funcione.
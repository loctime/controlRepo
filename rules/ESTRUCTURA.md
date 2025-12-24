# 📁 Estructura de Archivos - Firestore Rules

## 📋 Vista Completa de Archivos

### 🎯 CONTROLFILE (Repositorio Maestro)

```
controlFile/
├── firestore-rules/                    # 📁 Carpeta principal (TODA LA LÓGICA AQUÍ)
│   ├── base.rules                      # ✅ Helpers compartidos (igual en todos)
│   ├── controlFile.rules               # ✅ Reglas específicas de CONTROLFILE
│   ├── controlStore.rules              # ← Se agregarán cuando migres otras apps
│   ├── controlBio.rules                # ← Se agregarán cuando migres otras apps
│   ├── controlDoc.rules                # ← Se agregarán cuando migres otras apps
│   ├── build.js                        # ✅ Script que combina TODAS las apps
│   ├── README.md                       # ✅ Documentación completa
│   └── ESTRUCTURA.md                   # ✅ Este archivo
│
├── firestore.rules                     # ✅ GENERADO (NO editar manualmente) - RAIZ
├── firebase.json                       # ✅ Configuración (apunta a firestore.rules) - RAIZ
└── package.json                        # ✅ Script: "build:rules": "node firestore-rules/build.js"
```

**Archivos en raíz (requeridos por Firebase CLI):**
- ✅ `firestore.rules` - Generado automáticamente por `npm run build:rules`
- ✅ `firebase.json` - Configuración de Firebase (apunta a `firestore.rules`)

**Archivos en `firestore-rules/` (lógica modular):**
- ✅ `base.rules` - Helpers compartidos entre todas las apps
- ✅ `controlFile.rules` - Reglas de CONTROLFILE
- ✅ `build.js` - Script que combina todos los `.rules` en uno solo
- ✅ `README.md` - Documentación completa de arquitectura

---

### 🔧 Otras Apps (Repositorios Individuales)

```
repo-controlstore/                     # Ejemplo: CONTROL-STORE
├── firestore-rules/                   # 📁 Misma estructura que CONTROLFILE
│   ├── base.rules                     # ✅ IDÉNTICO al de CONTROLFILE (copiar)
│   ├── controlStore.rules             # ✅ Solo reglas de CONTROL-STORE
│   ├── build.js                        # ✅ Solo genera sus reglas (testing)
│   └── README.md                       # ✅ Documentación de referencia
│
├── firestore.rules                     # Generado (solo para testing local)
└── firebase.json                       # Sin "rules" o solo para local
```

**Para cada app individual:**
- ✅ `firestore-rules/base.rules` - **DEBE SER IDÉNTICO** al de CONTROLFILE
- ✅ `firestore-rules/[app].rules` - Solo sus reglas específicas
- ✅ `firestore-rules/build.js` - Script para testing local
- ✅ `package.json` - Script opcional para testing: `"build:rules": "node firestore-rules/build.js"`
- ❌ **NO deben** ejecutar `firebase deploy --only firestore:rules`

---

## 📝 Resumen de Archivos por Tipo

### Archivos Fuente (.rules)
| Archivo | Ubicación | Descripción | ¿Editable? |
|---------|----------|-------------|------------|
| `base.rules` | `firestore-rules/` | Helpers compartidos | ✅ Sí (sincronizar en todos los repos) |
| `controlFile.rules` | `firestore-rules/` | Reglas de CONTROLFILE | ✅ Sí |
| `controlStore.rules` | `firestore-rules/` | Reglas de CONTROL-STORE | ✅ Sí (cuando se agregue) |
| `[otra-app].rules` | `firestore-rules/` | Reglas de otras apps | ✅ Sí (cuando se agreguen) |

### Archivos Generados
| Archivo | Ubicación | Descripción | ¿Editable? |
|---------|----------|-------------|------------|
| `firestore.rules` | `raíz/` | Reglas combinadas | ❌ No (generado automáticamente) |

### Scripts y Configuración
| Archivo | Ubicación | Descripción | ¿Editable? |
|---------|----------|-------------|------------|
| `build.js` | `firestore-rules/` | Combina todos los .rules | ✅ Sí (agregar nuevas apps aquí) |
| `firebase.json` | `raíz/` | Configuración Firebase | ✅ Sí (controla qué archivo usar) |
| `package.json` | `raíz/` | Script npm | ✅ Sí (agrega `build:rules`) |

### Documentación
| Archivo | Ubicación | Descripción |
|---------|----------|-------------|
| `README.md` | `firestore-rules/` | Documentación completa de arquitectura |
| `ESTRUCTURA.md` | `firestore-rules/` | Este archivo (vista de archivos) |

---

## 🔄 Flujo de Trabajo

### 1. Agregar nuevas reglas en CONTROLFILE:
```bash
# Editar reglas modulares
# Editar firestore-rules/controlFile.rules o firestore-rules/base.rules

# Regenerar firestore.rules
npm run build:rules

# Desplegar
firebase deploy --only firestore:rules
```

### 2. Agregar nueva app:
1. Copiar `firestore-rules/[app].rules` desde el repo de la app
2. Actualizar `firestore-rules/build.js` para incluirla
3. `npm run build:rules` → `firebase deploy --only firestore:rules`

---

## ⚠️ Reglas de Oro

1. ✅ **NUNCA** editar `firestore.rules` manualmente (se regenera)
2. ✅ **SIEMPRE** mantener `base.rules` idéntico en todos los repos
3. ✅ **SOLO** CONTROLFILE despliega reglas al Firestore compartido
4. ✅ Todas las reglas modulares van en `firestore-rules/`
5. ✅ `firestore.rules` y `firebase.json` deben estar en la raíz


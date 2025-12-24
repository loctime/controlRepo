# 📐 Arquitectura de Firestore Rules

## 🏗️ Estructura de Repositorios

### CONTROLFILE (Repositorio Maestro) ✅

CONTROLFILE es el repositorio maestro que gestiona y despliega las reglas de Firestore para todas las apps.

**Estructura:**
```
repo-controlfile/
  firestore-rules/          # 📁 Carpeta organizada con todas las reglas
    base.rules              # Helpers compartidos (igual en todos los repos)
    controlFile.rules       # Reglas específicas de CONTROLFILE
    controlStore.rules      # Reglas de CONTROL-STORE (copiar desde repo-controlstore)
    controlBio.rules        # Reglas de CONTROLBIO (copiar desde repo-controlbio)
    controlDoc.rules        # Reglas de CONTROLDOC (copiar desde repo-controldoc)
    ...                     # Otras apps (cada una copia su .rules aquí)
    build.js                # Script que combina TODAS las apps
    README.md               # Esta documentación
  firestore.rules            # Generado (NO editar manualmente) - raíz
  firebase.json               # Configuración maestro - raíz
```

**📍 Ubicación de archivos de otras apps:**
Cada `[app].rules` de otras apps debe copiarse a `firestore-rules/[app].rules` en CONTROLFILE.
Por ejemplo:
- `repo-controlstore/firestore-rules/controlStore.rules` → `repo-controlfile/firestore-rules/controlStore.rules`
- `repo-controlbio/firestore-rules/controlBio.rules` → `repo-controlfile/firestore-rules/controlBio.rules`
- etc.

**firebase.json (CONTROLFILE):**
```json
{
  "firestore": {
    "rules": "firestore.rules",
    "indexes": "firestore.indexes.json"
  }
}
```

**Despliegue:**
```bash
# Generar firestore.rules con todas las apps
npm run build:rules

# Desplegar al Firestore compartido
firebase deploy --only firestore:rules
```

---

### Otras Apps (Repositorios Individuales)

Cada app individual mantiene su estructura modular pero **NO despliega reglas** al Firestore compartido.

**Estructura:**
```
repo-controlstore/
  firestore-rules/          # 📁 Misma estructura que CONTROLFILE
    base.rules              # IDÉNTICO al de CONTROLFILE (copiar desde CONTROLFILE)
    controlStore.rules      # Solo reglas de CONTROL-STORE
    build.js                # Genera solo sus reglas (para testing local)
    README.md               # Documentación de referencia
  firestore.rules            # Generado (solo para testing local)
  firebase.json               # Sin rules o solo para desarrollo local
```

**firebase.json (Otras Apps):**

**Opción 1: Sin rules (Recomendado)**
```json
{
  "firestore": {
    "indexes": "firestore.indexes.json"
  }
}
```

**Opción 2: Con rules solo para desarrollo local**
```json
{
  "firestore": {
    "rules": "firestore.rules",
    "indexes": "firestore.indexes.json"
  }
}
```

⚠️ **IMPORTANTE:** Las otras apps pueden generar `firestore.rules` para testing local, pero **NO deben desplegarlo** con `firebase deploy --only firestore:rules`. Solo CONTROLFILE despliega las reglas al Firestore compartido.

**Ejemplo de `firestore-rules/build.js` para otras apps:**
```javascript
const files = [
  'base.rules',
  'controlStore.rules'  // Solo esta app
];
// ... resto del script igual
```

**Ejemplo de `package.json` para otras apps:**
```json
{
  "scripts": {
    "build:rules": "node firestore-rules/build.js"  // Solo para testing local
  }
}
```

⚠️ **NUNCA ejecutar** `firebase deploy --only firestore:rules` desde repos que no sean CONTROLFILE.

---

## 🔄 Flujo de Trabajo

### Agregar una nueva app:

1. **En el repo de la nueva app:**
   - Crear carpeta `firestore-rules/` (si no existe)
   - Copiar `firestore-rules/base.rules` desde CONTROLFILE (debe ser idéntico)
   - Crear `firestore-rules/[app].rules` con sus reglas específicas
   - Crear/copiar `firestore-rules/build.js` (solo genera sus reglas para testing)
   - Agregar script `"build:rules": "node firestore-rules/build.js"` al `package.json`

2. **En CONTROLFILE (repo maestro):**
   - Copiar `firestore-rules/[app].rules` desde el repo de la nueva app
   - Actualizar `firestore-rules/build.js` para incluir la nueva app:
   ```javascript
   const files = [
     'base.rules',
     'controlFile.rules',
     'controlStore.rules',  // ← Nueva app
     // ...
   ];
   ```
   - Regenerar y desplegar:
   ```bash
   npm run build:rules
   firebase deploy --only firestore:rules
   ```

### Actualizar reglas de una app existente:

Cuando una app necesita modificar sus reglas (ej: CONTROL-STORE agrega nuevas colecciones):

**Paso 1: En el repo de la app (ej: repo-controlstore)**
1. Editar `firestore-rules/controlStore.rules` con los cambios
2. (Opcional) Probar localmente:
   ```bash
   npm run build:rules  # Genera firestore.rules solo con esta app (testing)
   # Probar con Firebase Emulator si lo necesitas
   ```

**Paso 2: Copiar cambios a CONTROLFILE (repo maestro)**
1. Copiar `firestore-rules/controlStore.rules` desde el repo de la app
2. **Pegar en CONTROLFILE aquí:** `firestore-rules/controlStore.rules` (misma ubicación, reemplaza el existente)

**Paso 3: Desplegar desde CONTROLFILE**
```bash
cd repo-controlfile
npm run build:rules              # Regenera firestore.rules con TODAS las apps
firebase deploy --only firestore:rules  # Despliega al Firestore compartido
```

⚠️ **IMPORTANTE:** 
- Las otras apps **NO despliegan** directamente
- Siempre copiar el archivo a CONTROLFILE y desplegar desde allí
- CONTROLFILE es la única fuente de verdad para despliegue

**📍 Dónde copiar cada archivo:**
```
CONTROLFILE/
  firestore-rules/
    base.rules                    ← Helpers compartidos
    controlFile.rules             ← Reglas de CONTROLFILE
    controlStore.rules            ← Copiar aquí desde repo-controlstore
    controlBio.rules              ← Copiar aquí desde repo-controlbio
    controlDoc.rules              ← Copiar aquí desde repo-controldoc
    ...                           ← Una carpeta, todos los .rules juntos
```

---

### Modificar `base.rules`:

1. **Actualizar en CONTROLFILE** (repositorio maestro) → `firestore-rules/base.rules`
2. **Sincronizar manualmente** en todas las demás apps (copiar el archivo a `firestore-rules/base.rules` en cada repo)
3. **Regenerar y desplegar** desde CONTROLFILE:
   ```bash
   npm run build:rules
   firebase deploy --only firestore:rules
   ```

---

## 📋 Checklist para Nueva App

- [ ] Crear carpeta `firestore-rules/` en el nuevo repo
- [ ] Copiar `firestore-rules/base.rules` idéntico desde CONTROLFILE
- [ ] Crear `firestore-rules/[app].rules` con reglas específicas
- [ ] Crear/copiar `firestore-rules/build.js` (solo para testing local)
- [ ] Agregar script `build:rules` al `package.json`
- [ ] Configurar `firebase.json` (sin rules o solo para local)
- [ ] Copiar `firestore-rules/[app].rules` a CONTROLFILE
- [ ] Actualizar `firestore-rules/build.js` maestro en CONTROLFILE
- [ ] Desplegar desde CONTROLFILE

---

## ⚠️ Reglas Importantes

1. ✅ Solo CONTROLFILE despliega reglas al Firestore compartido
2. ✅ `base.rules` debe ser IDÉNTICO en todos los repositorios
3. ✅ Cada app tiene su propio `firebase/[app].rules`
4. ✅ CONTROLFILE combina todas las apps en un solo `firestore.rules`
5. ✅ Otras apps pueden generar `firestore.rules` para testing, pero NO desplegarlo

---

## 📚 Documentación Específica de ControlAudit

Para información detallada sobre cómo ControlAudit se conecta con CONTROLFILE, ver:
- **[CONTROLFILE_FIRESTORE_RULES.md](../docs/CONTROLFILE_FIRESTORE_RULES.md)** - Guía completa de integración
- **[CONTROLFILE_INTEGRATION.md](../CONTROLFILE_INTEGRATION.md)** - Integración de almacenamiento de archivos
- **[CONTROLFILE_SETUP.md](../CONTROLFILE_SETUP.md)** - Configuración rápida


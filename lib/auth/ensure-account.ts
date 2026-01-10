/**
 * Integración con ControlFile para asegurar que existe la cuenta global
 * del usuario mediante POST /api/accounts/ensure
 * 
 * Esta función es idempotente y tolerante a errores:
 * - Si la cuenta ya existe, el endpoint la devuelve sin crear duplicados
 * - Si falla, la app continúa funcionando normalmente
 * - No bloquea el flujo de login ni la UI
 */

/**
 * Asegura que existe la cuenta global del usuario en ControlFile
 * @param idToken Token de Firebase ID del usuario autenticado
 * @param uid UID del usuario (opcional, para logging)
 * @returns Promise que se resuelve si la operación fue exitosa (o si falla silenciosamente)
 */
export async function ensureAccount(idToken: string, uid?: string): Promise<void> {
  const controlFileUrl = process.env.NEXT_PUBLIC_CONTROLFILE_URL
  if (!controlFileUrl) {
    console.warn("[ensureAccount] ⚠️ CONTROLFILE_URL no configurada, omitiendo ensure account")
    return
  }

  const endpoint = `${controlFileUrl}/api/accounts/ensure`
  const uidLog = uid ? ` (UID: ${uid})` : ""
  
  console.log(`[ensureAccount] 🔄 Asegurando cuenta global en ControlFile${uidLog}...`)
  
  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${idToken}`,
        "Content-Type": "application/json",
      },
    })

    // El endpoint es idempotente, así que 200 y 201 son ambos válidos
    if (response.ok) {
      const statusText = response.status === 201 ? "creada" : "existe"
      console.log(`[ensureAccount] ✅ Cuenta global ${statusText} exitosamente${uidLog}`)
      return
    }

    // 401 significa que el token es inválido - no reintentar, solo loguear
    if (response.status === 401) {
      console.warn(`[ensureAccount] ⚠️ Token inválido o expirado${uidLog}, omitiendo ensure account`)
      return
    }

    // Otros errores - loguear pero no bloquear
    const errorText = await response.text().catch(() => "Error desconocido")
    console.warn(`[ensureAccount] ❌ Error al asegurar cuenta${uidLog} (${response.status}):`, errorText)
  } catch (error) {
    // Errores de red, timeout, etc. - no bloquear la app
    const errorMessage = error instanceof Error ? error.message : "Error desconocido"
    console.warn(`[ensureAccount] ❌ Error de red al asegurar cuenta${uidLog}:`, errorMessage)
  }
}

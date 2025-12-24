/**
 * Utilidades para controlar concurrencia en operaciones asíncronas
 * Limita el número de operaciones simultáneas para evitar sobrecarga
 */

/**
 * Ejecuta un array de funciones asíncronas con límite de concurrencia
 * @param tasks Array de funciones que retornan Promises
 * @param limit Número máximo de tareas simultáneas
 * @returns Array de resultados en el mismo orden que las tareas
 */
export async function limitConcurrency<T>(
  tasks: Array<() => Promise<T>>,
  limit: number
): Promise<T[]> {
  const results: T[] = []
  const executing: Promise<void>[] = []

  for (const task of tasks) {
    const promise = task().then((result) => {
      results.push(result)
    })

    executing.push(promise)

    if (executing.length >= limit) {
      await Promise.race(executing)
      executing.splice(
        executing.findIndex((p) => p === promise),
        1
      )
    }
  }

  await Promise.all(executing)
  return results
}

/**
 * Procesa un array de items con una función async, limitando concurrencia
 * @param items Array de items a procesar
 * @param processor Función que procesa cada item
 * @param limit Número máximo de operaciones simultáneas
 * @returns Array de resultados en el mismo orden que los items
 */
export async function processWithLimit<T, R>(
  items: T[],
  processor: (item: T) => Promise<R>,
  limit: number
): Promise<R[]> {
  return limitConcurrency(
    items.map((item) => () => processor(item)),
    limit
  )
}


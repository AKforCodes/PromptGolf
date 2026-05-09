export type Result<T> = [Error, null] | [null, T]

export async function tryCatch<T>(promise: Promise<T>): Promise<Result<T>> {
  try {
    const value = await promise
    return [null, value]
  } catch (error) {
    return [error instanceof Error ? error : new Error(String(error)), null]
  }
}

export function tryCatchSync<T>(fn: () => T): Result<T> {
  try {
    const value = fn()
    return [null, value]
  } catch (error) {
    return [error instanceof Error ? error : new Error(String(error)), null]
  }
}

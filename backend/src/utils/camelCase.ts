/**
 * Utility function to convert snake_case keys to camelCase
 * This ensures consistent data format between database (snake_case) and API (camelCase)
 */

/**
 * Converts a snake_case string to camelCase
 * Example: "hello_world" -> "helloWorld"
 */
export function snakeToCamel(str: string): string {
  return str.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
}

/**
 * Recursively converts all snake_case keys in an object to camelCase
 * Handles nested objects and arrays
 */
export function toCamelCase<T>(obj: unknown): T {
  if (obj === null || obj === undefined) {
    return obj as T;
  }

  if (typeof obj !== 'object' || obj instanceof Date) {
    return obj as T;
  }

  if (Array.isArray(obj)) {
    return obj.map(item => toCamelCase(item)) as unknown as T;
  }

  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
    const camelKey = snakeToCamel(key);
    result[camelKey] = toCamelCase(value);
  }

  return result as T;
}

/**
 * Converts an array of database rows to camelCase objects
 */
export function rowsToCamelCase<T>(rows: unknown[]): T[] {
  return rows.map(row => toCamelCase<T>(row));
}
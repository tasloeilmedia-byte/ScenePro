import { NextResponse } from 'next/server'

/**
 * Parses a string query param as a positive integer.
 * Returns `fallback` if the value is missing, NaN, or <= 0.
 * Clamps to `max` if provided.
 */
export function parsePositiveInt(value: string | null, fallback: number, max?: number): number {
  const n = parseInt(value ?? '', 10)
  if (isNaN(n) || n < 1) return fallback
  if (max !== undefined && n > max) return max
  return n
}

/**
 * Parses a string query param as a positive number.
 * Returns `undefined` if the value is missing, NaN, or <= 0.
 */
export function parsePositiveNumber(value: string | null): number | undefined {
  if (!value) return undefined
  const n = Number(value)
  if (isNaN(n) || n <= 0) return undefined
  return n
}

/**
 * Parses a string query param against an allowed set of values.
 * Returns `fallback` if the value is missing or not in `allowed`.
 */
export function parseEnum<T extends string>(
  value: string | null,
  allowed: readonly T[],
  fallback: T
): T {
  if (value && (allowed as readonly string[]).includes(value)) return value as T
  return fallback
}

/**
 * Creates a consistent JSON error response.
 */
export function apiError(
  message: string,
  status: 400 | 401 | 403 | 404 | 409 | 500
): NextResponse {
  return NextResponse.json({ error: message }, { status })
}

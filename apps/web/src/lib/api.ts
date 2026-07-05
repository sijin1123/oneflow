/* Fetch wrapper (PLAN §8 data layer).
   - Base URL from VITE_ONEFLOW_API_BASE_URL (build-time, never a secret).
   - Date-only fields travel as 'YYYY-MM-DD' strings — no JS Date round-trip.
   - version is echoed as the integer the server returned (§6.2). */

export const BASE_URL: string =
  import.meta.env.VITE_ONEFLOW_API_BASE_URL ?? 'http://localhost:8000'

export class ApiError extends Error {
  status: number
  requestId: string | null
  payload: unknown

  constructor(status: number, message: string, requestId: string | null, payload: unknown) {
    super(message)
    this.status = status
    this.requestId = requestId
    this.payload = payload
  }
}

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: { 'content-type': 'application/json', ...(init?.headers ?? {}) },
    ...init,
  })
  const requestId = res.headers.get('x-request-id')
  if (!res.ok) {
    let payload: unknown = null
    let detail = `HTTP ${res.status}`
    try {
      payload = await res.json()
      const d = (payload as { detail?: unknown })?.detail
      if (typeof d === 'string') detail = d
    } catch {
      /* non-JSON error body — keep generic detail */
    }
    throw new ApiError(res.status, detail, requestId, payload)
  }
  // 204 No Content (e.g. DELETE) has no body to parse.
  if (res.status === 204 || res.headers.get('content-length') === '0') {
    return undefined as T
  }
  return (await res.json()) as T
}

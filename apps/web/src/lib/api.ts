/* Fetch wrapper (PLAN §8 data layer).
   - Base URL from VITE_ONEFLOW_API_BASE_URL (build-time, never a secret).
   - Date-only fields travel as 'YYYY-MM-DD' strings — no JS Date round-trip.
   - version is echoed as the integer the server returned (§6.2). */

import { detailFromPayload } from '@/lib/errors'

export { detailFromPayload }

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
    // Session cookie (Pass 72): the API may be cross-origin in dev
    // (5173 → 8000, CORS allow_credentials on the server side).
    credentials: 'include',
    ...init,
  })
  const requestId = res.headers.get('x-request-id')
  // 401 on a READ means the session is gone → go log in (v72.1 R1-⑤:
  // mutating requests keep their error surface so typed work is never lost;
  // auth endpoints and the login screen itself are exempt).
  if (
    res.status === 401 &&
    (init?.method ?? 'GET') === 'GET' &&
    !path.startsWith('/api/v1/auth/') &&
    !window.location.pathname.startsWith('/login')
  ) {
    const next = encodeURIComponent(
      window.location.pathname + window.location.search,
    )
    window.location.assign(`/login?next=${next}`)
  }
  if (!res.ok) {
    let payload: unknown = null
    let detail = `HTTP ${res.status}`
    try {
      payload = await res.json()
      detail = detailFromPayload(payload) ?? detail
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

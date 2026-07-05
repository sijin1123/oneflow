/* Framework-free error-body helpers (importable under `node --test`; no
   import.meta / DOM). */

/** Extract a human-readable message from an API error body. FastAPI sends
 *  `detail` as a string for HTTPException but as an array of {loc,msg,type} for
 *  422 validation errors — without this the UI would only ever show "HTTP 422". */
export function detailFromPayload(payload: unknown): string | null {
  const d = (payload as { detail?: unknown } | null)?.detail
  if (typeof d === 'string') return d
  if (Array.isArray(d) && d.length > 0) {
    const first = d[0] as { loc?: unknown[]; msg?: unknown }
    const field = Array.isArray(first.loc) ? first.loc[first.loc.length - 1] : undefined
    const msg = typeof first.msg === 'string' ? first.msg : '입력값이 올바르지 않습니다'
    return field ? `${String(field)}: ${msg}` : msg
  }
  return null
}

import { PUBLIC_API_BASE } from '../api/publicApi'

function normalizeAbsoluteUrl(raw) {
  const trimmed = String(raw || '').trim()
  if (!trimmed) return ''

  try {
    const parsed = new URL(trimmed, window.location.origin)

    // Avoid mixed-content blocks when current site is HTTPS and asset points to same-origin HTTP.
    if (
      window.location.protocol === 'https:' &&
      parsed.protocol === 'http:' &&
      parsed.hostname === window.location.hostname
    ) {
      parsed.protocol = 'https:'
    }

    return parsed.toString()
  } catch {
    return trimmed
  }
}

export function resolvePublicAssetUrl(path) {
  const raw = String(path || '').trim()
  if (!raw) return ''

  if (/^\/\//.test(raw)) {
    return normalizeAbsoluteUrl(`${window.location.protocol}${raw}`)
  }

  if (/^(https?:\/\/|data:|blob:)/i.test(raw)) {
    return normalizeAbsoluteUrl(raw)
  }

  const normalizedRelative = raw.replace(/^\/+/, '')
  return normalizeAbsoluteUrl(`${PUBLIC_API_BASE}${normalizedRelative}`)
}
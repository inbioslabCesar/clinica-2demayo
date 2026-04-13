export function sanitizeHexColor(value, fallback) {
  const raw = String(value || '').trim()
  if (/^#[0-9a-fA-F]{6}$/.test(raw)) return raw
  return fallback
}

export function sanitizeFontSize(value, fallback) {
  const raw = String(value || '').trim()
  if (!raw) return fallback

  const allowed = new Set(['1rem', '1.125rem', '1.25rem', '1.5rem', '1.875rem', '2.25rem', '3rem'])
  if (allowed.has(raw)) return raw

  const match = raw.match(/^([0-9]+(?:\.[0-9]+)?)(px|rem|em)$/)
  if (!match) return fallback

  const amount = Number(match[1])
  const unit = match[2]
  if (!Number.isFinite(amount)) return fallback

  if (unit === 'px' && amount >= 12 && amount <= 64) return raw
  if ((unit === 'rem' || unit === 'em') && amount >= 0.75 && amount <= 4) return raw

  return fallback
}
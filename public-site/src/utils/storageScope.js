export function resolveStorageScope() {
  const host = String(window.location.host || 'unknown-host').toLowerCase()
  const firstSegment = String(window.location.pathname || '/')
    .split('/')
    .filter(Boolean)[0] || 'root'
  return `${host}::${firstSegment}`
}

export function buildScopedStorageKey(baseKey) {
  const safeBase = String(baseKey || '').trim() || 'public_key'
  return `${safeBase}::${resolveStorageScope()}`
}

function getDefaultApiBase() {
  const hostname = window.location.hostname
  if (hostname === 'localhost' || hostname === '127.0.0.1') return 'http://localhost/clinica-2demayo/'

  const normalizedHost = hostname.replace(/^www\./i, '')
  if (/^sistema\./i.test(normalizedHost)) {
    return `${window.location.protocol}//${normalizedHost}/`
  }

  return `https://sistema.${normalizedHost}/`
}

export const PUBLIC_API_BASE = (import.meta.env.VITE_PUBLIC_API_BASE || getDefaultApiBase()).replace(/\/+$/, '/')

async function fetchJson(path) {
  const separator = path.includes('?') ? '&' : '?'
  const url = `${PUBLIC_API_BASE}${path}${separator}_t=${Date.now()}`
  const response = await fetch(url, {
    method: 'GET',
    headers: { 'Accept': 'application/json' },
    cache: 'no-store',
  })
  const data = await response.json().catch(() => null)
  if (!response.ok) {
    const message = data?.error || data?.message || `HTTP ${response.status}`
    throw new Error(message)
  }
  return data
}

export async function getServicios() {
  const data = await fetchJson('api_public_servicios.php')
  return data?.servicios || []
}

export async function getOfertas() {
  const data = await fetchJson('api_public_ofertas.php')
  return data?.ofertas || []
}

export async function getBanners() {
  const data = await fetchJson('api_public_banners.php')
  return data?.banners || []
}

export async function getConfiguracion() {
  const data = await fetchJson('api_get_configuracion.php')
  return data?.data || null
}

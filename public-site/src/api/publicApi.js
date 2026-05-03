function normalizeBase(base) {
  return String(base || '').trim().replace(/\/+$/, '/')
}

function buildApiBaseCandidates() {
  const hostname = window.location.hostname
  if (hostname === 'localhost' || hostname === '127.0.0.1') {
    return [normalizeBase(`${window.location.protocol}//${hostname}/clinica-2demayo/`)]
  }

  const protocol = window.location.protocol
  const host = window.location.host
  const normalizedHost = hostname.replace(/^www\./i, '')
  const candidates = []

  if (/^sistema\./i.test(normalizedHost)) {
    candidates.push(normalizeBase(`${protocol}//${host}/`))
  } else {
    // Priorizar despliegue por ruta: dominio/sistema/
    candidates.push(normalizeBase(`${protocol}//${host}/sistema/`))
    // Fallback para despliegues en subdominio sistema.<dominio>
    candidates.push(normalizeBase(`${protocol}//sistema.${normalizedHost}/`))
  }

  return [...new Set(candidates)]
}

const envApiBase = normalizeBase(import.meta.env.VITE_PUBLIC_API_BASE || '')
const runtimeApiBases = envApiBase ? [envApiBase] : buildApiBaseCandidates()

export const PUBLIC_API_BASE = runtimeApiBases[0]

async function fetchJson(path) {
  let lastError = null

  for (const base of runtimeApiBases) {
    const separator = path.includes('?') ? '&' : '?'
    const url = `${base}${path}${separator}_t=${Date.now()}`

    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: { 'Accept': 'application/json' },
        cache: 'no-store',
      })

      const data = await response.json().catch(() => null)
      if (!response.ok) {
        const message = data?.error || data?.message || `HTTP ${response.status}`
        lastError = new Error(message)
        continue
      }

      return data
    } catch (error) {
      lastError = error instanceof Error ? error : new Error('Error de conexión al API público')
    }
  }

  throw lastError || new Error('No se pudo conectar al API público')
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

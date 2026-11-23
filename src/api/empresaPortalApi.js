import { BASE_URL } from "../config/config";

async function parseJsonOrThrow(response) {
  let payload = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }

  if (!response.ok || !payload?.success) {
    const message = payload?.error || `Error HTTP ${response.status}`;
    const err = new Error(message);
    err.status = response.status;
    err.payload = payload;
    throw err;
  }

  return payload;
}

export async function listarOrdenesEmpresaPortal({
  q = "",
  estado = "",
  fechaDesde = "",
  fechaHasta = "",
  soloAprobados = true,
  page = 1,
  perPage = 20,
} = {}) {
  const params = new URLSearchParams({
    accion: "listar",
    q: String(q || "").trim(),
    page: String(page),
    per_page: String(perPage),
    solo_aprobados: soloAprobados ? "1" : "0",
  });
  if (String(estado || "").trim() !== "") {
    params.set("estado", String(estado).trim());
  }
  if (String(fechaDesde || "").trim() !== "") {
    params.set("fecha_desde", String(fechaDesde).trim());
  }
  if (String(fechaHasta || "").trim() !== "") {
    params.set("fecha_hasta", String(fechaHasta).trim());
  }

  const response = await fetch(`${BASE_URL}api_empresa_portal_ordenes.php?${params.toString()}`, {
    credentials: "include",
    cache: "no-store",
  });
  const payload = await parseJsonOrThrow(response);
  return {
    data: payload.data || [],
    meta: payload.meta || { page, per_page: perPage, total: 0, total_pages: 0 },
  };
}

export async function obtenerCertificadoDataEmpresaPortal(ordenId) {
  const params = new URLSearchParams({
    accion: "certificado_data",
    id: String(Number(ordenId) || 0),
  });
  const response = await fetch(`${BASE_URL}api_empresa_portal_ordenes.php?${params.toString()}`, {
    credentials: "include",
    cache: "no-store",
  });
  const payload = await parseJsonOrThrow(response);
  return payload.data || null;
}

export async function obtenerDescargaInterconsultaEmpresaPortal(ordenId) {
  const params = new URLSearchParams({
    accion: "interconsulta_descarga_info",
    orden_id: String(Number(ordenId) || 0),
  });
  const response = await fetch(`${BASE_URL}api_empresa_portal_ordenes.php?${params.toString()}`, {
    credentials: "include",
    cache: "no-store",
  });
  const payload = await parseJsonOrThrow(response);
  return payload.data || { disponible: false, total_documentos: 0, download_url: "" };
}

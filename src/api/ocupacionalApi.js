import { BASE_URL } from "../config/config";
import { authFetch } from "../utils/apiClient";

// Todas las llamadas de este módulo pasan por aquí (envía la sesión). Un 403 (sin permiso o módulo apagado) no debe cerrar
// la sesión clínica, por eso se suprime el evento global; un 401 (sesión vencida) sí lo dispara.
// Se nombra "fetch" a propósito para no tocar el resto del archivo, que viene del sistema ocupacional.
async function fetch(url, init = {}) {
  const response = await authFetch(url, { ...init, __skipAuthEvent: true });
  if (response.status === 401 && typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("auth-response-unauthorized", {
      detail: { status: 401, url: response.url || String(url), method: String(init?.method || "GET").toUpperCase() },
    }));
  }
  return response;
}

const jsonHeaders = {
  "Content-Type": "application/json",
};

function withNoCacheParams(params) {
  params.set("_cb", String(Date.now()));
  return params;
}

function parseJsonLenient(rawText) {
  const text = String(rawText || "").trim();
  if (!text) return null;

  try {
    return JSON.parse(text);
  } catch {
    // Some PHP environments prepend warnings/notices before the JSON payload.
    const candidates = [];
    const objStart = text.indexOf("{");
    const objEnd = text.lastIndexOf("}");
    if (objStart >= 0 && objEnd > objStart) {
      candidates.push(text.slice(objStart, objEnd + 1));
    }

    const arrStart = text.indexOf("[");
    const arrEnd = text.lastIndexOf("]");
    if (arrStart >= 0 && arrEnd > arrStart) {
      candidates.push(text.slice(arrStart, arrEnd + 1));
    }

    for (const candidate of candidates) {
      try {
        return JSON.parse(candidate);
      } catch {
        // keep trying
      }
    }

    return null;
  }
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRetryableRequestError(error) {
  const msg = String(error?.message || "").toLowerCase();
  const isHttp5xx = /error http 5\d{2}/.test(msg) || msg.includes("internal server error");
  return (
    msg.includes("failed to fetch")
    || msg.includes("networkerror")
    || msg.includes("network changed")
    || msg.includes("err_network_changed")
    || msg.includes("load failed")
    || isHttp5xx
    || msg.includes("error http 200")
    || msg.includes("respuesta no json")
  );
}

async function fetchJsonGetWithRetry(url, { retries = 1, retryDelayMs = 220 } = {}) {
  let lastError = null;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      const response = await fetch(url, { cache: "no-store" });
      return await parseJsonOrThrow(response);
    } catch (error) {
      lastError = error;
      if (attempt >= retries || !isRetryableRequestError(error)) {
        throw error;
      }
      await delay(retryDelayMs * (attempt + 1));
    }
  }
  throw lastError || new Error("No se pudo completar la solicitud");
}

function payloadIsSuccess(payload) {
  if (!payload || typeof payload !== "object") return false;
  if (payload.success === true) return true;
  if (payload.success === 1) return true;
  if (payload.success === "1") return true;
  if (String(payload.success || "").toLowerCase() === "true") return true;
  // Legacy compatibility: some endpoints return { data: ... } without success.
  if (!Object.prototype.hasOwnProperty.call(payload, "success") && Object.prototype.hasOwnProperty.call(payload, "data")) {
    return true;
  }
  return false;
}

async function parseJsonOrThrow(response) {
  const raw = await response.text();
  const payload = parseJsonLenient(raw);

  if (!response.ok || !payloadIsSuccess(payload)) {
    const message = response.ok
      ? (payload?.error || payload?.message || "Respuesta no JSON del servidor")
      : (payload?.error || payload?.message || `Error HTTP ${response.status}`);
    throw new Error(message);
  }

  return payload;
}

function buildApiError(message, status, payload = null) {
  const err = new Error(message || `Error HTTP ${status}`);
  err.status = status;
  err.payload = payload;
  err.data = payload?.data;
  return err;
}

async function parseJsonWithDetails(response) {
  const raw = await response.text();
  const payload = parseJsonLenient(raw);

  if (!response.ok || !payloadIsSuccess(payload)) {
    const message = payload?.error || payload?.message || `Error HTTP ${response.status}`;
    throw buildApiError(message, response.status, payload);
  }

  return payload;
}

export async function listarEmpresasOcupacionales({ estado = "activo" } = {}) {
  const params = withNoCacheParams(new URLSearchParams({
    accion: "catalogo",
    estado,
  }));
  const payload = await fetchJsonGetWithRetry(`${BASE_URL}api_ocupacional_empresas.php?${params.toString()}`);
  return payload.data || [];
}

export async function listarCatalogosLaboralesEmpresa({ empresaId, tipo, estado = "activo" } = {}) {
  const params = new URLSearchParams({
    empresa_id: String(Number(empresaId || 0)),
    tipo: String(tipo || "").trim().toLowerCase(),
    estado,
  });
  const response = await fetch(`${BASE_URL}api_ocupacional_catalogos_laborales.php?${params.toString()}`);
  const payload = await parseJsonOrThrow(response);
  return payload.data || [];
}

export async function guardarCatalogoLaboralEmpresa({ id, empresaId, tipo, nombre } = {}) {
  const response = await fetch(`${BASE_URL}api_ocupacional_catalogos_laborales.php`, {
    method: "POST",
    headers: jsonHeaders,
    body: JSON.stringify({
      accion: "guardar",
      ...(id ? { id: Number(id) } : {}),
      empresa_id: Number(empresaId || 0),
      tipo: String(tipo || "").trim().toLowerCase(),
      nombre: String(nombre || "").trim(),
    }),
  });
  const payload = await parseJsonOrThrow(response);
  return payload.data;
}

export async function cambiarEstadoCatalogoLaboralEmpresa({ id, estado } = {}) {
  const response = await fetch(`${BASE_URL}api_ocupacional_catalogos_laborales.php`, {
    method: "POST",
    headers: jsonHeaders,
    body: JSON.stringify({
      accion: "cambiar_estado",
      id: Number(id || 0),
      estado: String(estado || "").trim().toLowerCase(),
    }),
  });
  const payload = await parseJsonOrThrow(response);
  return payload.data;
}

export async function listarUbigeoDepartamentos() {
  const response = await fetch(`${BASE_URL}api_ubigeo.php?tipo=departamentos`);
  const payload = await parseJsonOrThrow(response);
  return payload.data || [];
}

export async function listarUbigeoProvincias(departamentoId) {
  const params = new URLSearchParams({
    tipo: "provincias",
    departamento_id: String(Number(departamentoId || 0)),
  });
  const response = await fetch(`${BASE_URL}api_ubigeo.php?${params.toString()}`);
  const payload = await parseJsonOrThrow(response);
  return payload.data || [];
}

export async function listarUbigeoDistritos(provinciaId) {
  const params = new URLSearchParams({
    tipo: "distritos",
    provincia_id: String(Number(provinciaId || 0)),
  });
  const response = await fetch(`${BASE_URL}api_ubigeo.php?${params.toString()}`);
  const payload = await parseJsonOrThrow(response);
  return payload.data || [];
}

export async function listarEmpresasOcupacionalesPaginado({
  estado = "activo",
  q = "",
  page = 1,
  perPage = 20,
  sortBy = "razon_social",
  sortDir = "asc",
} = {}) {
  const params = new URLSearchParams({
    estado,
    q,
    page: String(page),
    per_page: String(perPage),
    sort_by: sortBy,
    sort_dir: sortDir,
  });
  const response = await fetch(`${BASE_URL}api_ocupacional_empresas.php?${params.toString()}`);
  const payload = await parseJsonOrThrow(response);
  return {
    data: payload.data || [],
    meta: payload.meta || { page, per_page: perPage, total: 0, total_pages: 0 },
  };
}

export async function prevalidarInactivarEmpresaOcupacional(id) {
  const response = await fetch(`${BASE_URL}api_ocupacional_empresas.php`, {
    method: "POST",
    headers: jsonHeaders,
    body: JSON.stringify({ accion: "inactivar_seguro", id: Number(id), modo: "prevalidar" }),
  });
  const payload = await parseJsonWithDetails(response);
  return payload.data;
}

export async function inactivarEmpresaOcupacional(id, { force = false } = {}) {
  const response = await fetch(`${BASE_URL}api_ocupacional_empresas.php`, {
    method: "POST",
    headers: jsonHeaders,
    body: JSON.stringify({
      accion: "inactivar_seguro",
      id: Number(id),
      modo: "aplicar",
      force: Boolean(force),
    }),
  });
  const payload = await parseJsonWithDetails(response);
  return payload.data || payload;
}

export async function crearEmpresaOcupacional(data) {
  const bodyPayload = {
    ruc: String(data?.ruc || "").trim(),
    razon_social: String(data?.razon_social || "").trim(),
    nombre_comercial: String(data?.nombre_comercial || "").trim(),
    actividad: String(data?.actividad || "").trim(),
    direccion: String(data?.direccion || "").trim(),
    departamento: String(data?.departamento || "").trim(),
    provincia: String(data?.provincia || "").trim(),
    distrito: String(data?.distrito || "").trim(),
    telefono_1: String(data?.telefono_1 || data?.telefono || "").trim(),
    telefono_2: String(data?.telefono_2 || "").trim(),
    contacto_1: String(data?.contacto_1 || "").trim(),
    contacto_2: String(data?.contacto_2 || "").trim(),
    correo_1: String(data?.correo_1 || data?.correo || "").trim(),
    correo_2: String(data?.correo_2 || "").trim(),
    rrhh_usuario: String(data?.rrhh_usuario || "").trim(),
    rrhh_password: String(data?.rrhh_password || "").trim(),
    doctor_usuario: String(data?.doctor_usuario || "").trim(),
    doctor_password: String(data?.doctor_password || "").trim(),
    formato_principal: String(data?.formato_principal || "").trim(),
    formato_certificado: String(data?.formato_certificado || "").trim(),
    observacion: String(data?.observacion || "").trim(),
  };

  const response = await fetch(`${BASE_URL}api_ocupacional_empresas.php`, {
    method: "POST",
    headers: jsonHeaders,
    body: JSON.stringify(bodyPayload),
  });
  const payload = await parseJsonOrThrow(response);
  return payload.data;
}

export async function actualizarEmpresaOcupacional(data) {
  const response = await fetch(`${BASE_URL}api_ocupacional_empresas.php`, {
    method: "POST",
    headers: jsonHeaders,
    body: JSON.stringify({
      accion: "actualizar",
      id: Number(data?.id || 0),
      ruc: String(data?.ruc || "").trim(),
      razon_social: String(data?.razon_social || "").trim(),
      nombre_comercial: String(data?.nombre_comercial || "").trim(),
      actividad: String(data?.actividad || "").trim(),
      direccion: String(data?.direccion || "").trim(),
      departamento: String(data?.departamento || "").trim(),
      provincia: String(data?.provincia || "").trim(),
      distrito: String(data?.distrito || "").trim(),
      telefono_1: String(data?.telefono_1 || data?.telefono || "").trim(),
      telefono_2: String(data?.telefono_2 || "").trim(),
      contacto_1: String(data?.contacto_1 || "").trim(),
      contacto_2: String(data?.contacto_2 || "").trim(),
      correo_1: String(data?.correo_1 || data?.correo || "").trim(),
      correo_2: String(data?.correo_2 || "").trim(),
      rrhh_usuario: String(data?.rrhh_usuario || "").trim(),
      rrhh_password: String(data?.rrhh_password || "").trim(),
      doctor_usuario: String(data?.doctor_usuario || "").trim(),
      doctor_password: String(data?.doctor_password || "").trim(),
      formato_principal: String(data?.formato_principal || "").trim(),
      formato_certificado: String(data?.formato_certificado || "").trim(),
      observacion: String(data?.observacion || "").trim(),
    }),
  });
  const payload = await parseJsonOrThrow(response);
  return payload.data;
}

export async function reactivarEmpresaOcupacional(id) {
  const response = await fetch(`${BASE_URL}api_ocupacional_empresas.php`, {
    method: "POST",
    headers: jsonHeaders,
    body: JSON.stringify({
      accion: "reactivar_seguro",
      id: Number(id),
      modo: "aplicar",
    }),
  });
  const payload = await parseJsonWithDetails(response);
  return payload.data || payload;
}

export async function verificarIdentidadClinica({ documentoTipo, documentoNumero }) {
  const params = new URLSearchParams({
    documento_tipo: documentoTipo,
    documento_numero: documentoNumero,
  });

  const response = await fetch(`${BASE_URL}api_ocupacional_consultar_identidad.php?${params.toString()}`);
  const payload = await parseJsonOrThrow(response);
  return payload.data;
}

export async function registrarTrabajadorOcupacional(data) {
  const response = await fetch(`${BASE_URL}api_ocupacional_trabajadores.php`, {
    method: "POST",
    headers: jsonHeaders,
    body: JSON.stringify(data),
  });
  const payload = await parseJsonOrThrow(response);
  return payload.data;
}

export async function listarTrabajadoresOcupacionales({ estado = "todos" } = {}) {
  const params = withNoCacheParams(new URLSearchParams({
    estado,
    page: "1",
    per_page: "200",
  }));
  const payload = await fetchJsonGetWithRetry(`${BASE_URL}api_ocupacional_trabajadores.php?${params.toString()}`);
  return payload.data || [];
}

export async function listarTrabajadoresOcupacionalesPaginado({
  estado = "todos",
  q = "",
  empresaId = 0,
  page = 1,
  perPage = 20,
  sortBy = "fecha_ingreso",
  sortDir = "desc",
} = {}) {
  const params = withNoCacheParams(new URLSearchParams({
    estado,
    q,
    page: String(page),
    per_page: String(perPage),
    sort_by: sortBy,
    sort_dir: sortDir,
  }));
  if (Number(empresaId) > 0) {
    params.set("empresa_id", String(empresaId));
  }
  const payload = await fetchJsonGetWithRetry(`${BASE_URL}api_ocupacional_trabajadores.php?${params.toString()}`);
  return {
    data: payload.data || [],
    meta: payload.meta || { page, per_page: perPage, total: 0, total_pages: 0 },
  };
}

export async function darBajaTrabajadorOcupacional(id) {
  const response = await fetch(`${BASE_URL}api_ocupacional_trabajadores_baja.php`, {
    method: "POST",
    headers: jsonHeaders,
    body: JSON.stringify({ id }),
  });
  const payload = await parseJsonOrThrow(response);
  return payload;
}

export async function actualizarTrabajadorOcupacional({ id, puestoTrabajo, areaRiesgo, tipoContrato, fechaIngreso }) {
  const response = await fetch(`${BASE_URL}api_ocupacional_trabajadores_gestion.php`, {
    method: "POST",
    headers: jsonHeaders,
    body: JSON.stringify({
      accion: "actualizar",
      id: Number(id || 0),
      puesto_trabajo: String(puestoTrabajo || "").trim(),
      area_riesgo: String(areaRiesgo || "").trim(),
      tipo_contrato: String(tipoContrato || "").trim(),
      fecha_ingreso: String(fechaIngreso || "").trim(),
    }),
  });
  return parseJsonOrThrow(response);
}

export async function anularTrabajadorOcupacional({ id, motivo }) {
  const response = await fetch(`${BASE_URL}api_ocupacional_trabajadores_gestion.php`, {
    method: "POST",
    headers: jsonHeaders,
    body: JSON.stringify({ accion: "anular", id: Number(id || 0), motivo: String(motivo || "").trim() }),
  });
  return parseJsonOrThrow(response);
}

export async function listarExamenesOcupacionalesPaginado({
  estado = "activo",
  q = "",
  page = 1,
  perPage = 20,
  sortBy = "descripcion",
  sortDir = "asc",
} = {}) {
  const params = new URLSearchParams({
    estado,
    q,
    page: String(page),
    per_page: String(perPage),
    sort_by: sortBy,
    sort_dir: sortDir,
  });
  const response = await fetch(`${BASE_URL}api_ocupacional_examenes.php?${params.toString()}`);
  const payload = await parseJsonOrThrow(response);
  return {
    data: payload.data || [],
    meta: payload.meta || { page, per_page: perPage, total: 0, total_pages: 0 },
  };
}

export async function listarCatalogoGruposExamenOcupacional() {
  const params = new URLSearchParams({ accion: "catalogo_grupos" });
  const response = await fetch(`${BASE_URL}api_ocupacional_examenes.php?${params.toString()}`);
  const payload = await parseJsonOrThrow(response);
  return payload.data || { grupos: [], subgrupos_por_grupo: {} };
}

export async function listarExamenesLaboratorioOrigenOcupacional({ q = "", page = 1, perPage = 100 } = {}) {
  const params = new URLSearchParams({
    accion: "catalogo_laboratorio_origen",
    q,
    page: String(page),
    per_page: String(perPage),
  });
  const response = await fetch(`${BASE_URL}api_ocupacional_examenes.php?${params.toString()}`);
  const payload = await parseJsonOrThrow(response);
  return {
    data: payload.data || [],
    meta: payload.meta || { page, per_page: perPage, total: 0, total_pages: 0 },
  };
}

export async function importarExamenOcupacionalDesdeLaboratorio({
  laboratorioExamenId,
  grupoId = 0,
  subgrupoId = 0,
  grupo = "LABORATORIO",
  subgrupo = "",
  codigo = "",
  precio = null,
  posicion = 0,
} = {}) {
  const response = await fetch(`${BASE_URL}api_ocupacional_examenes.php`, {
    method: "POST",
    headers: jsonHeaders,
    body: JSON.stringify({
      accion: "importar_desde_laboratorio",
      laboratorio_examen_id: Number(laboratorioExamenId || 0),
      grupo_id: Number(grupoId || 0),
      subgrupo_id: Number(subgrupoId || 0),
      grupo: String(grupo || ""),
      subgrupo: String(subgrupo || ""),
      codigo: String(codigo || "").trim(),
      precio,
      posicion: Number(posicion || 0),
    }),
  });
  const payload = await parseJsonWithDetails(response);
  return payload.data;
}

export async function guardarGrupoMaestroExamenOcupacional({ nivel, nombre, parentId = 0 } = {}) {
  const response = await fetch(`${BASE_URL}api_ocupacional_examenes.php`, {
    method: "POST",
    headers: jsonHeaders,
    body: JSON.stringify({
      accion: "guardar_grupo_maestro",
      nivel: String(nivel || "grupo"),
      nombre: String(nombre || "").trim(),
      parent_id: Number(parentId || 0),
    }),
  });
  const payload = await parseJsonWithDetails(response);
  return payload.data;
}

export async function listarGruposMaestroExamenOcupacional({
  estado = "activo",
  q = "",
  page = 1,
  perPage = 20,
} = {}) {
  const params = new URLSearchParams({
    accion: "listar_grupos_maestro",
    estado,
    q,
    page: String(page),
    per_page: String(perPage),
  });
  const response = await fetch(`${BASE_URL}api_ocupacional_examenes.php?${params.toString()}`);
  const payload = await parseJsonWithDetails(response);
  return {
    data: payload.data || [],
    meta: payload.meta || { page, per_page: perPage, total: 0, total_pages: 0 },
  };
}

export async function actualizarGrupoMaestroExamenOcupacional({ id, nivel, nombre, parentId = 0 } = {}) {
  const response = await fetch(`${BASE_URL}api_ocupacional_examenes.php`, {
    method: "POST",
    headers: jsonHeaders,
    body: JSON.stringify({
      accion: "actualizar_grupo_maestro",
      id: Number(id || 0),
      nivel: String(nivel || ""),
      nombre: String(nombre || "").trim(),
      parent_id: Number(parentId || 0),
    }),
  });
  const payload = await parseJsonWithDetails(response);
  return payload.data;
}

export async function eliminarGrupoMaestroExamenOcupacional(id) {
  const response = await fetch(`${BASE_URL}api_ocupacional_examenes.php`, {
    method: "POST",
    headers: jsonHeaders,
    body: JSON.stringify({ accion: "eliminar_grupo_maestro", id: Number(id || 0) }),
  });
  const payload = await parseJsonWithDetails(response);
  return payload;
}

export async function crearExamenOcupacional(data) {
  const response = await fetch(`${BASE_URL}api_ocupacional_examenes.php`, {
    method: "POST",
    headers: jsonHeaders,
    body: JSON.stringify(data),
  });
  const payload = await parseJsonOrThrow(response);
  return payload.data;
}

export async function actualizarExamenOcupacional(data) {
  const response = await fetch(`${BASE_URL}api_ocupacional_examenes.php`, {
    method: "POST",
    headers: jsonHeaders,
    body: JSON.stringify(data),
  });
  const payload = await parseJsonOrThrow(response);
  return payload.data;
}

export async function inactivarExamenOcupacional(id) {
  const response = await fetch(`${BASE_URL}api_ocupacional_examenes.php`, {
    method: "POST",
    headers: jsonHeaders,
    body: JSON.stringify({ accion: "inactivar", id }),
  });
  const payload = await parseJsonOrThrow(response);
  return payload;
}

export async function listarCatalogoEmpresaExamenesPaginado({
  empresaId,
  estadoCatalogo = "todos",
  q = "",
  page = 1,
  perPage = 50,
} = {}) {
  const params = new URLSearchParams({
    empresa_id: String(empresaId || 0),
    estado_catalogo: estadoCatalogo,
    q,
    page: String(page),
    per_page: String(perPage),
  });

  const response = await fetch(`${BASE_URL}api_ocupacional_catalogo.php?${params.toString()}`);
  const payload = await parseJsonOrThrow(response);
  return {
    data: payload.data || [],
    meta: payload.meta || { page, per_page: perPage, total: 0, total_pages: 0 },
  };
}

export async function actualizarCatalogoEmpresaExamen({ empresaId, examenId, habilitado }) {
  const response = await fetch(`${BASE_URL}api_ocupacional_catalogo.php`, {
    method: "POST",
    headers: jsonHeaders,
    body: JSON.stringify({
      empresa_id: Number(empresaId),
      examen_id: Number(examenId),
      habilitado: Boolean(habilitado),
    }),
  });
  const payload = await parseJsonOrThrow(response);
  return payload.data;
}

export async function obtenerImpactoCatalogoEmpresaExamen({ empresaId, examenId } = {}) {
  const params = new URLSearchParams({
    accion: "impacto",
    empresa_id: String(empresaId || 0),
    examen_id: String(examenId || 0),
  });
  const response = await fetch(`${BASE_URL}api_ocupacional_catalogo.php?${params.toString()}`);
  const payload = await parseJsonOrThrow(response);
  return payload.data || {
    catalogo_id: null,
    estado: "inactivo",
    protocolos_configurados: 0,
    montos_configurados: 0,
    condiciones_configuradas: 0,
  };
}

export async function listarTiposEvaluacionOcupacional() {
  const params = withNoCacheParams(new URLSearchParams({ accion: "tipos" }));
  const payload = await fetchJsonGetWithRetry(`${BASE_URL}api_ocupacional_protocolos.php?${params.toString()}`);
  return payload.data || [];
}

export async function listarTiposEvaluacionOcupacionalGestion({ estado = "todos" } = {}) {
  const params = new URLSearchParams({
    accion: "listar_tipos_gestion",
    estado,
  });
  const response = await fetch(`${BASE_URL}api_ocupacional_protocolos.php?${params.toString()}`);
  const payload = await parseJsonOrThrow(response);
  return payload.data || [];
}

export async function guardarTipoEvaluacionOcupacional({
  id,
  codigo,
  nombre,
  orden = 0,
  estado = "activo",
} = {}) {
  const response = await fetch(`${BASE_URL}api_ocupacional_protocolos.php`, {
    method: "POST",
    headers: jsonHeaders,
    body: JSON.stringify({
      accion: "guardar_tipo_evaluacion",
      ...(id ? { id: Number(id) } : {}),
      codigo: String(codigo || "").trim().toUpperCase(),
      nombre: String(nombre || "").trim(),
      orden: Number(orden || 0),
      estado: String(estado || "activo"),
    }),
  });
  const payload = await parseJsonOrThrow(response);
  return payload.data;
}

export async function cambiarEstadoTipoEvaluacionOcupacional({ id, estado } = {}) {
  const response = await fetch(`${BASE_URL}api_ocupacional_protocolos.php`, {
    method: "POST",
    headers: jsonHeaders,
    body: JSON.stringify({
      accion: "cambiar_estado_tipo_evaluacion",
      id: Number(id || 0),
      estado: String(estado || "").trim().toLowerCase(),
    }),
  });
  const payload = await parseJsonOrThrow(response);
  return payload.data;
}

export async function listarPlantillasCondicionesOcupacionales() {
  const params = new URLSearchParams({ accion: "listar_plantillas_condiciones" });
  const response = await fetch(`${BASE_URL}api_ocupacional_protocolos.php?${params.toString()}`);
  const payload = await parseJsonOrThrow(response);
  return payload.data || [];
}

export async function listarProtocolosOcupacionales({ empresaId, estado = "activo" } = {}) {
  const params = withNoCacheParams(new URLSearchParams({
    accion: "listar_protocolos",
    empresa_id: String(empresaId || 0),
    estado,
  }));
  const payload = await fetchJsonGetWithRetry(`${BASE_URL}api_ocupacional_protocolos.php?${params.toString()}`);
  return payload.data || [];
}

export async function guardarProtocoloOcupacional({ id, empresaId, descripcion, sembrarMontosBase = false }) {
  const response = await fetch(`${BASE_URL}api_ocupacional_protocolos.php`, {
    method: "POST",
    headers: jsonHeaders,
    body: JSON.stringify({
      accion: "guardar_protocolo",
      ...(id ? { id: Number(id) } : {}),
      empresa_id: Number(empresaId),
      descripcion: String(descripcion || "").trim(),
      sembrar_montos_base: Boolean(sembrarMontosBase),
    }),
  });
  const payload = await parseJsonOrThrow(response);
  return payload.data;
}

export async function inactivarProtocoloOcupacional(id) {
  const response = await fetch(`${BASE_URL}api_ocupacional_protocolos.php`, {
    method: "POST",
    headers: jsonHeaders,
    body: JSON.stringify({ accion: "inactivar_protocolo", id: Number(id) }),
  });
  const payload = await parseJsonOrThrow(response);
  return payload;
}

export async function copiarConfiguracionProtocoloOcupacional({
  empresaId,
  protocoloOrigenId,
  protocoloDestinoId,
  copiarMontos = true,
  copiarCondiciones = true,
  soloPrevisualizar = false,
} = {}) {
  const response = await fetch(`${BASE_URL}api_ocupacional_protocolos.php`, {
    method: "POST",
    headers: jsonHeaders,
    body: JSON.stringify({
      accion: "copiar_configuracion_protocolo",
      empresa_id: Number(empresaId),
      protocolo_origen_id: Number(protocoloOrigenId),
      protocolo_destino_id: Number(protocoloDestinoId),
      copiar_montos: Boolean(copiarMontos),
      copiar_condiciones: Boolean(copiarCondiciones),
      solo_previsualizar: Boolean(soloPrevisualizar),
    }),
  });
  const payload = await parseJsonOrThrow(response);
  return payload.data;
}

export async function listarMatrizProtocoloOcupacional({
  empresaId,
  protocoloId,
  q = "",
  page = 1,
  perPage = 50,
} = {}) {
  const params = new URLSearchParams({
    accion: "listar_matriz",
    empresa_id: String(empresaId || 0),
    protocolo_id: String(protocoloId || 0),
    q,
    page: String(page),
    per_page: String(perPage),
  });
  const response = await fetch(`${BASE_URL}api_ocupacional_protocolos.php?${params.toString()}`);
  const payload = await parseJsonOrThrow(response);
  return {
    tipos: payload.tipos || [],
    data: payload.data || [],
    totales: payload.totales || {},
    meta: payload.meta || { page, per_page: perPage, total: 0, total_pages: 0 },
  };
}

export async function guardarMontoProtocoloOcupacional({
  protocoloId,
  catalogoId,
  tipoEvaluacionId,
  monto,
  restablecerBase = false,
} = {}) {
  const response = await fetch(`${BASE_URL}api_ocupacional_protocolos.php`, {
    method: "POST",
    headers: jsonHeaders,
    body: JSON.stringify({
      accion: "guardar_monto",
      protocolo_id: Number(protocoloId),
      catalogo_id: Number(catalogoId),
      tipo_evaluacion_id: Number(tipoEvaluacionId),
      monto,
      restablecer_base: Boolean(restablecerBase),
    }),
  });
  const payload = await parseJsonOrThrow(response);
  return payload.data;
}

export async function listarPuestosOcupacionalesEmpresa(empresaId) {
  const params = new URLSearchParams({
    accion: "listar_puestos",
    empresa_id: String(empresaId || 0),
  });
  const response = await fetch(`${BASE_URL}api_ocupacional_protocolos.php?${params.toString()}`);
  const payload = await parseJsonOrThrow(response);
  return payload.data || [];
}

export async function listarCondicionesProtocoloOcupacional({ protocoloId, catalogoId } = {}) {
  const params = new URLSearchParams({
    accion: "listar_condiciones",
    protocolo_id: String(protocoloId || 0),
    catalogo_id: String(catalogoId || 0),
  });
  const response = await fetch(`${BASE_URL}api_ocupacional_protocolos.php?${params.toString()}`);
  const payload = await parseJsonOrThrow(response);
  return payload.data || [];
}

export async function guardarCondicionProtocoloOcupacional({
  id,
  protocoloId,
  catalogoId,
  puestoTrabajo,
  sexo,
  edadMin,
  edadMax,
} = {}) {
  const response = await fetch(`${BASE_URL}api_ocupacional_protocolos.php`, {
    method: "POST",
    headers: jsonHeaders,
    body: JSON.stringify({
      accion: "guardar_condicion",
      ...(id ? { id: Number(id) } : {}),
      protocolo_id: Number(protocoloId),
      catalogo_id: Number(catalogoId),
      puesto_trabajo: puestoTrabajo || "",
      sexo: sexo || "",
      edad_min: edadMin ?? "",
      edad_max: edadMax ?? "",
    }),
  });
  const payload = await parseJsonOrThrow(response);
  return payload.data;
}

export async function eliminarCondicionProtocoloOcupacional({ id, protocoloId, catalogoId } = {}) {
  const response = await fetch(`${BASE_URL}api_ocupacional_protocolos.php`, {
    method: "POST",
    headers: jsonHeaders,
    body: JSON.stringify({
      accion: "eliminar_condicion",
      id: Number(id),
      protocolo_id: Number(protocoloId),
      catalogo_id: Number(catalogoId),
    }),
  });
  const payload = await parseJsonOrThrow(response);
  return payload;
}

export async function aplicarCondicionMasivaProtocoloOcupacional({
  protocoloId,
  empresaId,
  filtroQ,
  puestoTrabajo,
  sexo,
  edadMin,
  edadMax,
  soloPrevisualizar = false,
} = {}) {
  const response = await fetch(`${BASE_URL}api_ocupacional_protocolos.php`, {
    method: "POST",
    headers: jsonHeaders,
    body: JSON.stringify({
      accion: "aplicar_condicion_masiva",
      protocolo_id: Number(protocoloId),
      empresa_id: Number(empresaId),
      filtro_q: String(filtroQ || "").trim(),
      puesto_trabajo: puestoTrabajo || "",
      sexo: sexo || "",
      edad_min: edadMin ?? "",
      edad_max: edadMax ?? "",
      solo_previsualizar: Boolean(soloPrevisualizar),
    }),
  });
  const payload = await parseJsonOrThrow(response);
  return payload.data;
}

export async function previsualizarOrdenOcupacional({
  empresaId,
  trabajadorId,
  protocoloId,
  tipoEvaluacionId,
} = {}) {
  const params = new URLSearchParams({
    accion: "previsualizar",
    empresa_id: String(empresaId || 0),
    trabajador_id: String(trabajadorId || 0),
    protocolo_id: String(protocoloId || 0),
    tipo_evaluacion_id: String(tipoEvaluacionId || 0),
  });
  const response = await fetch(`${BASE_URL}api_ocupacional_ordenes.php?${params.toString()}`);
  const payload = await parseJsonOrThrow(response);
  return payload.data;
}

export async function registrarOrdenOcupacional({
  empresaId,
  trabajadorId,
  protocoloId,
  tipoEvaluacionId,
  fechaOrden,
  observacion,
  subcontrataEmpresaId = 0,
  facturarEmpresaId = 0,
  medicoResponsableId = 0,
  firmaDoctor = "GALLEGOS",
  modo = "CONVALIDACION",
  gestante = false,
  documento = "",
  indicaDr = "",
} = {}) {
  const response = await fetch(`${BASE_URL}api_ocupacional_ordenes.php`, {
    method: "POST",
    headers: jsonHeaders,
    body: JSON.stringify({
      accion: "registrar_orden",
      empresa_id: Number(empresaId),
      trabajador_id: Number(trabajadorId),
      protocolo_id: Number(protocoloId),
      tipo_evaluacion_id: Number(tipoEvaluacionId),
      fecha_orden: String(fechaOrden || "").trim(),
      observacion: String(observacion || "").trim(),
      subcontrata_empresa_id: Number(subcontrataEmpresaId || 0),
      facturar_empresa_id: Number(facturarEmpresaId || 0),
      medico_responsable_id: Number(medicoResponsableId || 0),
      firma_doctor: String(firmaDoctor || "").trim(),
      modo: String(modo || "").trim(),
      gestante: Boolean(gestante),
      documento: String(documento || "").trim(),
      indica_dr: String(indicaDr || "").trim(),
    }),
  });
  const payload = await parseJsonOrThrow(response);
  return payload.data;
}

export async function listarHistoriaOcupacionalPorOrden(ordenId) {
  const params = new URLSearchParams({
    accion: "listar",
    orden_id: String(ordenId || 0),
  });
  const response = await fetch(`${BASE_URL}api_ocupacional_historia.php?${params.toString()}`);
  const payload = await parseJsonOrThrow(response);
  return {
    orden: payload.orden || null,
    data: payload.data || [],
  };
}

export async function obtenerHistoriaOcupacional(id) {
  const params = new URLSearchParams({
    accion: "obtener",
    id: String(id || 0),
  });
  const response = await fetch(`${BASE_URL}api_ocupacional_historia.php?${params.toString()}`);
  const payload = await parseJsonOrThrow(response);
  return {
    orden: payload.orden || null,
    data: payload.data || null,
  };
}

export async function guardarHistoriaOcupacional(data = {}) {
  const response = await fetch(`${BASE_URL}api_ocupacional_historia.php`, {
    method: "POST",
    headers: jsonHeaders,
    body: JSON.stringify({
      accion: "guardar",
      ...data,
    }),
  });
  const payload = await parseJsonOrThrow(response);
  return {
    orden: payload.orden || null,
    data: payload.data || null,
    message: payload.message || "",
  };
}

export async function anularHistoriaOcupacional({ id, motivo = "" } = {}) {
  const response = await fetch(`${BASE_URL}api_ocupacional_historia.php`, {
    method: "POST",
    headers: jsonHeaders,
    body: JSON.stringify({
      accion: "anular",
      id: Number(id),
      motivo: String(motivo || "").trim(),
    }),
  });
  const payload = await parseJsonOrThrow(response);
  return payload;
}

export async function obtenerHistoriaClinicaOcupacionalConsolidada(ordenId) {
  const params = new URLSearchParams({
    accion: "consolidado",
    orden_id: String(ordenId || 0),
  });
  const response = await fetch(`${BASE_URL}api_ocupacional_clinica.php?${params.toString()}`);
  const payload = await parseJsonOrThrow(response);
  return payload.data || null;
}

export async function obtenerResultadoClinicoOcupacional({ ordenDetalleId, formatoCodigo = "" } = {}) {
  const params = new URLSearchParams({
    accion: "obtener",
    orden_detalle_id: String(Number(ordenDetalleId) || 0),
  });
  if (String(formatoCodigo || "").trim() !== "") {
    params.set("formato_codigo", String(formatoCodigo).trim());
  }
  const response = await fetch(`${BASE_URL}api_ocupacional_resultados.php?${params.toString()}`);
  const payload = await parseJsonOrThrow(response);
  return {
    detalle: payload.detalle || null,
    data: payload.data || null,
    plantillaSugerida: payload.plantilla_sugerida || null,
    plantillasDisponibles: payload.plantillas_disponibles || [],
  };
}

export async function listarPlantillasResultadoClinicoOcupacional({
  examenCodigo = "",
  examenDescripcion = "",
  formatoCodigo = "",
} = {}) {
  const params = new URLSearchParams({ accion: "listar_plantillas" });
  if (String(examenCodigo || "").trim() !== "") {
    params.set("examen_codigo", String(examenCodigo).trim());
  }
  if (String(examenDescripcion || "").trim() !== "") {
    params.set("examen_descripcion", String(examenDescripcion).trim());
  }
  if (String(formatoCodigo || "").trim() !== "") {
    params.set("formato_codigo", String(formatoCodigo).trim());
  }

  const response = await fetch(`${BASE_URL}api_ocupacional_resultados.php?${params.toString()}`);
  const payload = await parseJsonOrThrow(response);
  return payload.data || null;
}

export async function guardarPlantillaResultadoClinicoOcupacional({
  id = 0,
  ordenDetalleId = 0,
  nombre,
  codigo = "",
  templateCode = "",
  examenCodigo = "",
  examenDescripcion = "",
  formatoCodigo = "",
  datosJson,
} = {}) {
  const response = await fetch(`${BASE_URL}api_ocupacional_resultados.php`, {
    method: "POST",
    headers: jsonHeaders,
    body: JSON.stringify({
      accion: "guardar_plantilla",
      id: Number(id) || 0,
      orden_detalle_id: Number(ordenDetalleId) || 0,
      nombre: String(nombre || "").trim(),
      codigo: String(codigo || "").trim(),
      template_code: String(templateCode || "").trim(),
      examen_codigo: String(examenCodigo || "").trim(),
      examen_descripcion: String(examenDescripcion || "").trim(),
      formato_codigo: String(formatoCodigo || "").trim(),
      datos_json: datosJson,
    }),
  });
  const payload = await parseJsonOrThrow(response);
  return payload.data || null;
}

export async function eliminarPlantillaResultadoClinicoOcupacional(id, { ordenDetalleId = 0 } = {}) {
  const response = await fetch(`${BASE_URL}api_ocupacional_resultados.php`, {
    method: "POST",
    headers: jsonHeaders,
    body: JSON.stringify({
      accion: "eliminar_plantilla",
      id: Number(id) || 0,
      orden_detalle_id: Number(ordenDetalleId) || 0,
    }),
  });
  const payload = await parseJsonOrThrow(response);
  return payload;
}

export async function guardarResultadoClinicoOcupacional({
  ordenDetalleId,
  formatoCodigo,
  datosJson,
  estado = "borrador",
  observacion = "",
} = {}) {
  const response = await fetch(`${BASE_URL}api_ocupacional_resultados.php`, {
    method: "POST",
    headers: jsonHeaders,
    body: JSON.stringify({
      accion: "guardar",
      orden_detalle_id: Number(ordenDetalleId),
      formato_codigo: String(formatoCodigo || "").trim(),
      datos_json: datosJson,
      estado: String(estado || "borrador").trim(),
      observacion: String(observacion || "").trim(),
    }),
  });
  const payload = await parseJsonOrThrow(response);
  return payload.data || null;
}

export async function registrarEmisionPdfResultadoClinicoOcupacional({ ordenDetalleId, formatoCodigo } = {}) {
  const response = await fetch(`${BASE_URL}api_ocupacional_resultados.php`, {
    method: "POST",
    headers: jsonHeaders,
    body: JSON.stringify({
      accion: "registrar_emision_pdf",
      orden_detalle_id: Number(ordenDetalleId) || 0,
      formato_codigo: String(formatoCodigo || "").trim(),
    }),
  });
  return await parseJsonOrThrow(response);
}

export async function resolverFirmantePdfResultadoClinicoOcupacional({ ordenDetalleId, formatoCodigo = "" } = {}) {
  const params = new URLSearchParams({
    accion: "resolver_firmante_pdf",
    orden_detalle_id: String(Number(ordenDetalleId) || 0),
  });
  if (String(formatoCodigo || "").trim() !== "") {
    params.set("formato_codigo", String(formatoCodigo).trim());
  }
  const response = await fetch(`${BASE_URL}api_ocupacional_resultados.php?${params.toString()}`);
  const payload = await parseJsonOrThrow(response);
  return payload.data || null;
}

export async function actualizarExamenDetalleOcupacional({ ordenDetalleId } = {}) {
  const response = await fetch(`${BASE_URL}api_ocupacional_resultados.php`, {
    method: "POST",
    headers: jsonHeaders,
    body: JSON.stringify({
      accion: "actualizar_examen_detalle",
      orden_detalle_id: Number(ordenDetalleId) || 0,
    }),
  });
  const payload = await parseJsonOrThrow(response);
  return payload.data || null;
}

export async function listarOrdenesOcupacionalesPaginado({
  empresaId = 0,
  estado = "",
  tipo = "",
  fechaDesde = "",
  fechaHasta = "",
  q = "",
  page = 1,
  perPage = 20,
  soloTriaje = false,
} = {}) {
  const params = withNoCacheParams(new URLSearchParams({
    accion: "listar_ordenes",
    q,
    page: String(page),
    per_page: String(perPage),
  }));
  if (Number(empresaId) > 0) {
    params.set("empresa_id", String(empresaId));
  }
  if (String(estado || "").trim() !== "") {
    params.set("estado", String(estado).trim());
  }
  if (String(tipo || "").trim() !== "") {
    params.set("tipo", String(tipo).trim());
  }
  if (String(fechaDesde || "").trim() !== "") {
    params.set("fecha_desde", String(fechaDesde).trim());
  }
  if (String(fechaHasta || "").trim() !== "") {
    params.set("fecha_hasta", String(fechaHasta).trim());
  }
  if (soloTriaje) {
    params.set("solo_triaje", "1");
  }
  const payload = await fetchJsonGetWithRetry(`${BASE_URL}api_ocupacional_ordenes.php?${params.toString()}`);
  return {
    data: payload.data || [],
    meta: payload.meta || { page, per_page: perPage, total: 0, total_pages: 0 },
  };
}

export async function obtenerDetalleOrdenOcupacional(id) {
  const params = new URLSearchParams({
    accion: "detalle_orden",
    id: String(Number(id) || 0),
  });
  const response = await fetch(`${BASE_URL}api_ocupacional_ordenes.php?${params.toString()}`);
  const payload = await parseJsonOrThrow(response);
  return payload.data;
}

export async function anularOrdenOcupacional(id, motivo = "") {
  const response = await fetch(`${BASE_URL}api_ocupacional_ordenes.php`, {
    method: "POST",
    headers: jsonHeaders,
    body: JSON.stringify({ accion: "anular_orden", id: Number(id), motivo: String(motivo || "").trim() }),
  });
  const payload = await parseJsonOrThrow(response);
  return payload;
}

export async function cerrarOrdenOcupacional(id) {
  const response = await fetch(`${BASE_URL}api_ocupacional_ordenes.php`, {
    method: "POST",
    headers: jsonHeaders,
    body: JSON.stringify({ accion: "cerrar_orden", id: Number(id) }),
  });
  const payload = await parseJsonOrThrow(response);
  return payload;
}

export async function editarOrdenOcupacional({
  id,
  empresaId,
  trabajadorId,
  protocoloId,
  tipoEvaluacionId,
  fechaOrden,
  observacion,
  medicoResponsableId,
  modo,
  gestante,
  documento,
  indicaDr,
  subcontrataEmpresaId,
  facturarEmpresaId,
} = {}) {
  const response = await fetch(`${BASE_URL}api_ocupacional_ordenes.php`, {
    method: "POST",
    headers: jsonHeaders,
    body: JSON.stringify({
      accion: "editar_orden",
      id: Number(id),
      empresa_id: Number(empresaId || 0),
      trabajador_id: Number(trabajadorId || 0),
      protocolo_id: Number(protocoloId || 0),
      tipo_evaluacion_id: Number(tipoEvaluacionId || 0),
      fecha_orden: String(fechaOrden || "").trim(),
      observacion: String(observacion || "").trim(),
      medico_responsable_id: Number(medicoResponsableId || 0),
      modo: String(modo || "").trim(),
      gestante: typeof gestante === "boolean" ? gestante : undefined,
      documento: String(documento || "").trim(),
      indica_dr: String(indicaDr || "").trim(),
      subcontrata_empresa_id: Number(subcontrataEmpresaId ?? -1),
      facturar_empresa_id: Number(facturarEmpresaId ?? -1),
    }),
  });
  const payload = await parseJsonOrThrow(response);
  return payload.data;
}

export async function eliminarOrdenOcupacional(id) {
  const response = await fetch(`${BASE_URL}api_ocupacional_ordenes.php`, {
    method: "POST",
    headers: jsonHeaders,
    body: JSON.stringify({ accion: "eliminar_orden", id: Number(id) }),
  });
  const payload = await parseJsonOrThrow(response);
  return payload.data;
}

export async function guardarAptitudOrdenOcupacional({
  id,
  aptitudFinal,
  restriccionFinal,
  recomendacionFinal,
  medicoResponsableId,
  certificadoFechaEvaluacion,
  certificadoFechaEmision,
} = {}) {
  const response = await fetch(`${BASE_URL}api_ocupacional_ordenes.php`, {
    method: "POST",
    headers: jsonHeaders,
    body: JSON.stringify({
      accion: "guardar_aptitud_orden",
      id: Number(id),
      aptitud_final: String(aptitudFinal || "").trim(),
      restriccion_final: String(restriccionFinal || "").trim(),
      recomendacion_final: String(recomendacionFinal || "").trim(),
      medico_responsable_id: Number(medicoResponsableId || 0),
      certificado_fecha_evaluacion: String(certificadoFechaEvaluacion || "").trim(),
      certificado_fecha_emision: String(certificadoFechaEmision || "").trim(),
    }),
  });
  const payload = await parseJsonOrThrow(response);
  return payload.data;
}

export async function registrarEmisionCertificadoOrdenOcupacional({
  id,
  formato = "pdf",
} = {}) {
  const response = await fetch(`${BASE_URL}api_ocupacional_ordenes.php`, {
    method: "POST",
    headers: jsonHeaders,
    body: JSON.stringify({
      accion: "registrar_emision_certificado_orden",
      id: Number(id),
      formato: String(formato || "pdf").trim() || "pdf",
    }),
  });
  const payload = await parseJsonOrThrow(response);
  return payload.data;
}

export async function actualizarDetalleOrdenOcupacional({
  detalleId,
  estadoEjecucion,
  observacionEjecucion,
} = {}) {
  const response = await fetch(`${BASE_URL}api_ocupacional_ordenes.php`, {
    method: "POST",
    headers: jsonHeaders,
    body: JSON.stringify({
      accion: "actualizar_detalle_orden",
      detalle_id: Number(detalleId),
      estado_ejecucion: String(estadoEjecucion || "").trim(),
      observacion_ejecucion: String(observacionEjecucion || "").trim(),
    }),
  });
  const payload = await parseJsonOrThrow(response);
  return payload.data;
}

export async function listarInterconsultasOcupacionales(ordenId) {
  const params = new URLSearchParams({ orden_id: String(Number(ordenId) || 0) });
  const response = await fetch(`${BASE_URL}api_ocupacional_interconsultas.php?${params.toString()}`);
  const payload = await parseJsonOrThrow(response);
  return payload.data || [];
}

export async function crearInterconsultaOcupacional({
  ordenId,
  ordenDetalleId,
  especialidad,
  motivo,
  diagnosticoCie10 = "",
  diagnosticoDescripcion = "",
  observaciones = "",
} = {}) {
  const response = await fetch(`${BASE_URL}api_ocupacional_interconsultas.php`, {
    method: "POST",
    headers: jsonHeaders,
    body: JSON.stringify({
      accion: "crear",
      orden_id: Number(ordenId),
      orden_detalle_id: Number(ordenDetalleId),
      especialidad: String(especialidad || "").trim(),
      motivo: String(motivo || "").trim(),
      diagnostico_cie10: String(diagnosticoCie10 || "").trim(),
      diagnostico_descripcion: String(diagnosticoDescripcion || "").trim(),
      observaciones: String(observaciones || "").trim(),
    }),
  });
  const payload = await parseJsonOrThrow(response);
  return payload.data;
}

export async function responderInterconsultaOcupacional({
  id,
  especialistaNombre,
  respuesta,
  respuestaArchivo = null,
} = {}) {
  const formData = new FormData();
  formData.append("accion", "responder");
  formData.append("id", String(Number(id) || 0));
  formData.append("especialista_nombre", String(especialistaNombre || "").trim());
  formData.append("respuesta", String(respuesta || "").trim());
  if (respuestaArchivo instanceof File) {
    formData.append("respuesta_archivo", respuestaArchivo);
  }
  const response = await fetch(`${BASE_URL}api_ocupacional_interconsultas.php`, {
    method: "POST",
    body: formData,
  });
  const payload = await parseJsonOrThrow(response);
  return payload.data;
}

export async function levantarInterconsultaOcupacional({
  id,
  levantamiento,
  recomendacion,
  resultadoLevantamiento,
  medicoId,
} = {}) {
  const response = await fetch(`${BASE_URL}api_ocupacional_interconsultas.php`, {
    method: "POST",
    headers: jsonHeaders,
    body: JSON.stringify({
      accion: "levantar",
      id: Number(id),
      levantamiento: String(levantamiento || "").trim(),
      recomendacion: String(recomendacion || "").trim(),
      resultado_levantamiento: String(resultadoLevantamiento || "").trim(),
      medico_id: Number(medicoId || 0),
    }),
  });
  const payload = await parseJsonOrThrow(response);
  return payload.data;
}

export async function anularInterconsultaOcupacional(id, motivo) {
  const response = await fetch(`${BASE_URL}api_ocupacional_interconsultas.php`, {
    method: "POST",
    headers: jsonHeaders,
    body: JSON.stringify({ accion: "anular", id: Number(id), motivo: String(motivo || "").trim() }),
  });
  const payload = await parseJsonOrThrow(response);
  return payload.data;
}

export async function listarEventosOrdenOcupacional({
  ordenId,
  tipo = "",
  fechaDesde = "",
  fechaHasta = "",
  limit = 100,
} = {}) {
  const params = new URLSearchParams({
    accion: "eventos_orden",
    id: String(Number(ordenId) || 0),
    limit: String(Number(limit) || 100),
  });
  if (String(tipo || "").trim() !== "") {
    params.set("tipo", String(tipo).trim());
  }
  if (String(fechaDesde || "").trim() !== "") {
    params.set("fecha_desde", String(fechaDesde).trim());
  }
  if (String(fechaHasta || "").trim() !== "") {
    params.set("fecha_hasta", String(fechaHasta).trim());
  }

  const response = await fetch(`${BASE_URL}api_ocupacional_ordenes.php?${params.toString()}`);
  const payload = await parseJsonOrThrow(response);
  return payload.data || [];
}

export async function obtenerResumenOrdenesOcupacionales({
  empresaId = 0,
  estado = "",
  tipo = "",
  fechaDesde = "",
  fechaHasta = "",
  q = "",
} = {}) {
  const params = withNoCacheParams(new URLSearchParams({ accion: "resumen_ordenes", q }));
  if (Number(empresaId) > 0) params.set("empresa_id", String(empresaId));
  if (String(estado || "").trim() !== "") params.set("estado", String(estado).trim());
  if (String(tipo || "").trim() !== "") params.set("tipo", String(tipo).trim());
  if (String(fechaDesde || "").trim() !== "") params.set("fecha_desde", String(fechaDesde).trim());
  if (String(fechaHasta || "").trim() !== "") params.set("fecha_hasta", String(fechaHasta).trim());

  const payload = await fetchJsonGetWithRetry(`${BASE_URL}api_ocupacional_ordenes.php?${params.toString()}`);
  return payload.data || null;
}

export async function obtenerReporteOrdenesOcupacionales({
  empresaId = 0,
  estado = "",
  tipo = "",
  fechaDesde = "",
  fechaHasta = "",
  q = "",
  limit = 2000,
} = {}) {
  const params = new URLSearchParams({
    accion: "reporte_ordenes",
    q,
    limit: String(Number(limit) || 2000),
  });
  if (Number(empresaId) > 0) params.set("empresa_id", String(empresaId));
  if (String(estado || "").trim() !== "") params.set("estado", String(estado).trim());
  if (String(tipo || "").trim() !== "") params.set("tipo", String(tipo).trim());
  if (String(fechaDesde || "").trim() !== "") params.set("fecha_desde", String(fechaDesde).trim());
  if (String(fechaHasta || "").trim() !== "") params.set("fecha_hasta", String(fechaHasta).trim());

  const response = await fetch(`${BASE_URL}api_ocupacional_ordenes.php?${params.toString()}`);
  const payload = await parseJsonOrThrow(response);
  return payload.data || [];
}

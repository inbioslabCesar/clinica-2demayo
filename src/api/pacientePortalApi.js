import { BASE_URL } from "../config/config";

// Portal del paciente: llamadas con fetch simple (no usa authFetch para que un 401/403 del paciente
// nunca se confunda con el cierre de sesión del personal).
const URL_API = `${BASE_URL}api_paciente_portal.php`;

async function leerJson(response) {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

async function llamar(accion, { method = "GET", body, params = {} } = {}) {
  const query = new URLSearchParams({ accion, ...params });
  const response = await fetch(`${URL_API}?${query.toString()}`, {
    method,
    credentials: "include",
    cache: "no-store",
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const payload = await leerJson(response);
  if (!response.ok || !payload?.success) {
    const err = new Error(payload?.error || `Error HTTP ${response.status}`);
    err.status = response.status;
    err.estado = payload?.estado || "";
    throw err;
  }
  return payload;
}

export async function sesionPaciente() {
  return llamar("sesion");
}

export async function loginPaciente(documento, pin) {
  return llamar("login", { method: "POST", body: { documento, pin } });
}

export async function logoutPaciente() {
  return llamar("logout", { method: "POST" });
}

export async function listarDocumentosPaciente() {
  const payload = await llamar("listar");
  return payload.data || [];
}

// Descarga el archivo como blob: así un bloqueo (deuda, en revisión) se muestra como mensaje y no como JSON en otra pestaña.
export async function descargarDocumentoPaciente(tipo, id) {
  const query = new URLSearchParams({ accion: "descargar", tipo, id: String(id) });
  const response = await fetch(`${URL_API}?${query.toString()}`, { credentials: "include", cache: "no-store" });
  const tipoContenido = response.headers.get("Content-Type") || "";
  const esArchivo = tipoContenido.includes("application/pdf") || tipoContenido.startsWith("image/");
  if (!response.ok || !esArchivo) {
    const payload = tipoContenido.includes("json") ? await leerJson(response) : null;
    const err = new Error(payload?.error || "No se pudo descargar el documento");
    err.status = response.status;
    err.estado = payload?.estado || "";
    throw err;
  }
  const disposicion = response.headers.get("Content-Disposition") || "";
  const nombreServidor = /filename="?([^";]+)"?/i.exec(disposicion)?.[1];
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const enlace = document.createElement("a");
  enlace.href = url;
  enlace.download = nombreServidor || `${tipo}_${id}.pdf`;
  document.body.appendChild(enlace);
  enlace.click();
  enlace.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

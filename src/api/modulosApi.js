import { authFetch } from "../utils/apiClient";

// Los errores 401/403 de estas llamadas son esperados (sin sesión de panel o módulo apagado):
// __skipAuthEvent evita que se interpreten como cierre de sesión de la clínica.
const OPCIONES = { __skipAuthEvent: true };

async function leerJson(res) {
  try {
    return await res.json();
  } catch {
    return { success: false, error: "Respuesta invalida del servidor" };
  }
}

export async function fetchModulosActivos() {
  const res = await authFetch("api_modulos.php", OPCIONES);
  const data = await leerJson(res);
  return data?.success && data.modulos && typeof data.modulos === "object" ? data.modulos : null;
}

export async function engineerEstado() {
  const res = await authFetch("api_engineer.php?accion=estado", OPCIONES);
  if (res.status === 404) return { desactivado: true };
  return leerJson(res);
}

export async function engineerLogin(password, codigo) {
  const res = await authFetch("api_engineer.php", {
    ...OPCIONES,
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ accion: "login", password, codigo }),
  });
  return leerJson(res);
}

export async function engineerListar() {
  const res = await authFetch("api_engineer.php?accion=listar", OPCIONES);
  const data = await leerJson(res);
  return { ...data, status: res.status };
}

export async function engineerActualizar(csrf, modulo, datos) {
  const res = await authFetch("api_engineer.php", {
    ...OPCIONES,
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Engineer-Csrf": csrf },
    body: JSON.stringify({ accion: "actualizar", modulo, datos }),
  });
  return leerJson(res);
}

export async function engineerPortalPacientesOpciones(csrf, datos) {
  const res = await authFetch("api_engineer.php", {
    ...OPCIONES,
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Engineer-Csrf": csrf },
    body: JSON.stringify({ accion: "portal_pacientes_opciones", datos }),
  });
  return leerJson(res);
}

export async function engineerLogout(csrf) {
  const res = await authFetch("api_engineer.php", {
    ...OPCIONES,
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Engineer-Csrf": csrf },
    body: JSON.stringify({ accion: "logout" }),
  });
  return leerJson(res);
}

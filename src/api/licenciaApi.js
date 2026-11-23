import { authFetch } from "../utils/apiClient";

// Estas llamadas manejan sus propios 401/403/402: no deben cerrar la sesión de la clínica.
const OPCIONES = { __skipAuthEvent: true };

async function leerJson(res) {
  try {
    return await res.json();
  } catch {
    return { success: false, error: "Respuesta invalida del servidor" };
  }
}

/** Estado de la suscripción visible para la sesión actual, o null si no se pudo leer (nunca bloquea por un error). */
export async function fetchLicencia() {
  try {
    const res = await authFetch("api_licencia.php", OPCIONES);
    const data = await leerJson(res);
    return data?.success ? data : null;
  } catch {
    return null;
  }
}

export async function engineerLicencia() {
  const res = await authFetch("api_engineer.php?accion=licencia", OPCIONES);
  const data = await leerJson(res);
  return { ...data, status: res.status };
}

async function postEngineer(csrf, cuerpo) {
  const res = await authFetch("api_engineer.php", {
    ...OPCIONES,
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Engineer-Csrf": csrf },
    body: JSON.stringify(cuerpo),
  });
  const data = await leerJson(res);
  return { ...data, status: res.status };
}

export const engineerLicenciaGuardar = (csrf, datos) => postEngineer(csrf, { accion: "licencia_guardar", datos });
export const engineerLicenciaPago = (csrf, datos) => postEngineer(csrf, { accion: "licencia_pago", datos });
export const engineerLicenciaProrroga = (csrf, hasta) => postEngineer(csrf, { accion: "licencia_prorroga", hasta });

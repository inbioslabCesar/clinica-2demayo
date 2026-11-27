// Decide qué mostrar para una ruta de módulo opcional. Mientras se consulta el módulo se espera, para no perder un enlace directo;
// si falla la consulta, useModulos deja solo 'clinico' activo, así que el módulo se considera apagado (falla seguro).
// La protección real está en el backend (ModulosInstalacion::exigir); esto solo evita mostrar pantallas de un módulo apagado.
export const ACCESO_MODULO = Object.freeze({ CARGANDO: "cargando", PERMITIDO: "permitido", DENEGADO: "denegado" });

export function resolverAccesoModulo({ modulo, modulos, cargando }) {
  if (modulo === "clinico") return ACCESO_MODULO.PERMITIDO;
  if (modulos && modulos[modulo] === true) return ACCESO_MODULO.PERMITIDO;
  return cargando ? ACCESO_MODULO.CARGANDO : ACCESO_MODULO.DENEGADO;
}

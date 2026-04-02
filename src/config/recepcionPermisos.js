export const RECEPCION_PERMISOS = [
  { key: "ver_pacientes", label: "Pacientes" },
  { key: "ver_usuarios", label: "Usuarios" },
  { key: "ver_medicos", label: "Medicos / registrar medico" },
  { key: "ver_panel_enfermeria", label: "Panel enfermeria" },
  { key: "ver_gestion_tarifas", label: "Gestión de Tarifas" },
  { key: "ver_inventario_general", label: "Inventario General" },
  { key: "ver_panel_laboratorio", label: "Panel laboratorio" },
  { key: "ver_inventario_laboratorio", label: "Inventario laboratorio" },
  { key: "ver_modulo_quimico", label: "Modulo quimico / farmacia" },
  { key: "ver_contabilidad", label: "Contabilidad y reportes" },
  { key: "ver_cotizaciones", label: "Cotizaciones" },
  { key: "ver_lista_consultas", label: "Lista de Consultas" },
  { key: "ver_recordatorios_citas", label: "Recordatorios de Citas" },
  { key: "ver_web_servicios", label: "Web servicios" },
  { key: "ver_web_ofertas", label: "Web ofertas" },
  { key: "ver_web_banners", label: "Web banners" },
  { key: "ver_configuracion", label: "Configuración" },
  { key: "ver_plantillas_hc", label: "Plantillas HC" },
  { key: "ver_tema", label: "Personalización" },
  { key: "ver_reabrir_caja", label: "Reabrir Cajas" }
];

// Compatibilidad para recepcionistas antiguos (sin permisos persistidos):
// solo se habilitan los modulos historicamente visibles en su sidebar.
export const RECEPCION_PERMISOS_LEGACY = [
  "ver_pacientes",
  "ver_contabilidad",
  "ver_medicos",
  "ver_panel_enfermeria",
  "ver_panel_laboratorio",
  "ver_modulo_quimico",
  "ver_cotizaciones",
  "ver_lista_consultas",
  "ver_recordatorios_citas"
];

const RECEPCION_KEYS = new Set(RECEPCION_PERMISOS.map((p) => p.key));

export function normalizePermisos(permisos) {
  let source = permisos;
  if (typeof source === "string") {
    try {
      source = JSON.parse(source);
    } catch {
      source = source.split(",");
    }
  }
  if (!Array.isArray(source)) return [];
  return source
    .map((p) => String(p || "").trim())
    .filter((p, idx, arr) => p && arr.indexOf(p) === idx && RECEPCION_KEYS.has(p));
}

export function getPermisosRecepcionista(usuario) {
  if (!usuario || usuario.rol !== "recepcionista") return [];
  const list = normalizePermisos(usuario.permisos);
  // Compatibilidad: recepcionistas antiguos sin permisos mantienen solo accesos legacy.
  return list.length > 0 ? list : RECEPCION_PERMISOS_LEGACY;
}

export function hasPermiso(usuario, permiso) {
  if (!permiso) return true;
  if (!usuario) return false;
  if (usuario.rol === "administrador") return true;
  if (usuario.rol !== "recepcionista") return true;
  return getPermisosRecepcionista(usuario).includes(permiso);
}

const DEFAULT_PREFIX_BY_TIPO = {
  medico: "Dr(a).",
  psicologo: "Psic.",
  obstetra: "Obst.",
  odontologo: "Od.",
  nutricionista: "Nut.",
  enfermeria: "Lic.",
  otro: "Prof.",
};

export function getProfesionalPrefix(profesional = {}) {
  const tipo = String(profesional?.tipo_profesional || "").toLowerCase().trim();
  const abreviatura = String(
    profesional?.abreviatura_profesional || profesional?.abreviatura || ""
  ).trim();

  if (abreviatura) return abreviatura;
  return DEFAULT_PREFIX_BY_TIPO[tipo] || DEFAULT_PREFIX_BY_TIPO.medico;
}

export function formatProfesionalName(profesional = {}) {
  const prefix = getProfesionalPrefix(profesional);
  const nombre = String(profesional?.nombre || profesional?.medico_nombre || "").trim();
  const apellido = String(profesional?.apellido || profesional?.medico_apellido || "").trim();
  const full = [nombre, apellido].filter(Boolean).join(" ").replace(/\s+/g, " ").trim();

  return full ? `${prefix} ${full}` : prefix;
}

export function formatColegiatura(profesional = {}) {
  const sigla = String(profesional?.colegio_sigla || "").trim();
  const numero = String(
    profesional?.nro_colegiatura || profesional?.cmp || ""
  ).trim();

  if (sigla && numero) return `${sigla}: ${numero}`;
  if (numero) return `Colegiatura: ${numero}`;
  return "N/A";
}

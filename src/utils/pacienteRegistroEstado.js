function text(value) {
  return String(value || "").trim();
}

function hasDate(value) {
  const v = text(value);
  if (!v) return false;
  if (v === "0000-00-00") return false;
  return /^\d{4}-\d{2}-\d{2}/.test(v);
}

function hasNumber(value) {
  if (value === null || value === undefined) return false;
  const v = text(value);
  if (!v) return false;
  const n = Number(v);
  return Number.isFinite(n) && n >= 0;
}

export function evaluarRegistroPaciente(paciente) {
  const p = paciente || {};
  const fechaNacimientoOk = hasDate(p.fecha_nacimiento);
  const edadOk = hasNumber(p.edad);

  const motivos = [];
  if (!fechaNacimientoOk && !edadOk) motivos.push("falta fecha de nacimiento o edad");

  return {
    incompleto: motivos.length > 0,
    motivos,
  };
}

export function textoMotivosRegistroIncompleto(motivos) {
  const list = Array.isArray(motivos) ? motivos.filter(Boolean) : [];
  return list.length > 0
    ? `Registro incompleto: ${list.join(", ")}.`
    : "Registro completo";
}

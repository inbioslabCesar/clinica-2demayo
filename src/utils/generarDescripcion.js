export function generarDescripcion(medico, descripcionBase) {
  if (!medico || medico.id === "general" || medico.id === "") {
    return descripcionBase || "Consulta General";
  }
  const nombreCompleto = medico.nombre;
  const especialidad = medico.especialidad ? ` - ${medico.especialidad}` : "";
  // Eliminar nombre/especialidad duplicados en la descripción base
  let base = descripcionBase || "Consulta";
  // Usar string normal para evitar escapes innecesarios en template string
  let patronStr = "^(Dr(a).\\s*)?" + nombreCompleto;
  if (medico.especialidad) {
    patronStr += "(\\s*-\\s*" + medico.especialidad + ")?";
  }
  patronStr += "\\s*-\\s*";
  const patron = new RegExp(patronStr, "i");
  base = base.replace(patron, "").trim();
  return `${nombreCompleto}${especialidad} - ${base}`.replace(/ - $/, "");
}

export function generarDescripcion(medico, descripcionBase) {
  if (!medico || medico.id === "general" || medico.id === "") {
    return descripcionBase || "Consulta General";
  }
  const nombreCompleto = medico.nombre;
  const especialidad = medico.especialidad ? ` - ${medico.especialidad}` : "";
  // Eliminar nombre/especialidad duplicados en la descripción base
  let base = descripcionBase || "Consulta";
  const patron = new RegExp(`^(Dr\(a\)\.\s*)?${nombreCompleto}(\s*-\s*${medico.especialidad})?\s*-\s*`, "i");
  base = base.replace(patron, "").trim();
  return `${nombreCompleto}${especialidad} - ${base}`.replace(/ - $/, "");
}

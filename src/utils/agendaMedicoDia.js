// Agenda del médico en un día, a partir de api_horarios_disponibles.php:
// horarios_disponibles = objetos { hora: "09:20", hora_db: "09:20:00", ... } y horarios_ocupados = textos "HH:MM[:SS]".

function aHoraCorta(valor) {
  const m = String(valor || "").match(/^(\d{1,2}):(\d{2})/);
  return m ? `${m[1].padStart(2, "0")}:${m[2]}` : "";
}

/** @returns {{libres: string[], ocupados: string[], slot: number}} horas "HH:MM" ordenadas y sin repetir */
export function normalizarAgendaDia(respuesta) {
  const unicasOrdenadas = (lista) => [...new Set(lista.filter(Boolean))].sort();
  const libres = (Array.isArray(respuesta?.horarios_disponibles) ? respuesta.horarios_disponibles : [])
    .map((h) => (typeof h === "string" ? aHoraCorta(h) : aHoraCorta(h?.hora_db || h?.hora)));
  const ocupados = (Array.isArray(respuesta?.horarios_ocupados) ? respuesta.horarios_ocupados : [])
    .map((h) => aHoraCorta(typeof h === "string" ? h : h?.hora_db || h?.hora));
  return { libres: unicasOrdenadas(libres), ocupados: unicasOrdenadas(ocupados), slot: Number(respuesta?.duracion_slot_min || 0) };
}

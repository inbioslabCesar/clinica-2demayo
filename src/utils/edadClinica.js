function parseIsoDate(value) {
  const raw = String(value || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return null;
  const [y, m, d] = raw.split("-").map((v) => Number(v));
  const date = new Date(y, m - 1, d);
  if (Number.isNaN(date.getTime())) return null;
  return date;
}

function calcularEdadClinica(fechaNacimientoRaw, fechaReferenciaRaw = null) {
  const nacimiento = parseIsoDate(fechaNacimientoRaw);
  if (!nacimiento) {
    return { dias: null, meses: null, anios: null, mesesResto: null, diasResto: null };
  }

  const ref = parseIsoDate(fechaReferenciaRaw) || new Date();
  const hoyInicio = new Date(ref.getFullYear(), ref.getMonth(), ref.getDate());
  const nacimientoInicio = new Date(nacimiento.getFullYear(), nacimiento.getMonth(), nacimiento.getDate());

  if (hoyInicio.getTime() < nacimientoInicio.getTime()) {
    return { dias: 0, meses: 0, anios: 0, mesesResto: 0, diasResto: 0 };
  }

  const diffMs = hoyInicio.getTime() - nacimientoInicio.getTime();
  const dias = Math.max(0, Math.floor(diffMs / (1000 * 60 * 60 * 24)));

  let meses = (hoyInicio.getFullYear() - nacimientoInicio.getFullYear()) * 12 + (hoyInicio.getMonth() - nacimientoInicio.getMonth());
  if (hoyInicio.getDate() < nacimientoInicio.getDate()) {
    meses -= 1;
  }
  meses = Math.max(0, meses);

  let anios = hoyInicio.getFullYear() - nacimientoInicio.getFullYear();
  const noCumplioEsteAnio =
    hoyInicio.getMonth() < nacimientoInicio.getMonth()
    || (hoyInicio.getMonth() === nacimientoInicio.getMonth() && hoyInicio.getDate() < nacimientoInicio.getDate());
  if (noCumplioEsteAnio) {
    anios -= 1;
  }
  anios = Math.max(0, anios);

  let mesesResto = hoyInicio.getMonth() - nacimientoInicio.getMonth();
  if (hoyInicio.getDate() < nacimientoInicio.getDate()) {
    mesesResto -= 1;
  }
  if (mesesResto < 0) {
    mesesResto += 12;
  }

  let diasResto;
  if (hoyInicio.getDate() >= nacimientoInicio.getDate()) {
    diasResto = hoyInicio.getDate() - nacimientoInicio.getDate();
  } else {
    const diasMesPrevio = new Date(hoyInicio.getFullYear(), hoyInicio.getMonth(), 0).getDate();
    diasResto = diasMesPrevio - nacimientoInicio.getDate() + hoyInicio.getDate();
  }

  return {
    dias,
    meses,
    anios,
    mesesResto: Math.max(0, mesesResto),
    diasResto: Math.max(0, diasResto),
  };
}

function formatearUnidad(valor, singular, plural) {
  return `${valor} ${Math.abs(Number(valor)) === 1 ? singular : plural}`;
}

export function resolverEdadDisplayClinica(paciente) {
  const edad = String(paciente?.edad ?? "").trim();
  const unidadRaw = String(paciente?.edad_unidad || "").trim();
  const unidad = unidadRaw.toLowerCase();

  const { dias, meses, anios, mesesResto, diasResto } = calcularEdadClinica(
    paciente?.fecha_nacimiento,
    paciente?.edad_referencia_fecha || null
  );

  const isRnPorUnidad = unidad.includes("rn") || unidad.includes("reci") || unidad.includes("neo");
  const isRnPorDias = Number.isFinite(dias) && dias !== null && dias <= 28;
  const esRn = isRnPorUnidad || isRnPorDias;

  if (esRn && dias !== null && meses !== null) {
    return `${formatearUnidad(dias, "día", "días")} (${formatearUnidad(meses, "mes", "meses")})`;
  }

  if (meses !== null && meses < 12) {
    return formatearUnidad(meses, "mes", "meses");
  }

  if (anios !== null && anios >= 1) {
    const mesesMostrar = Number.isFinite(mesesResto) ? Math.max(0, mesesResto) : 0;
    const diasMostrar = Number.isFinite(diasResto) ? Math.max(0, diasResto) : 0;
    return `${formatearUnidad(anios, "año", "años")} ${formatearUnidad(mesesMostrar, "mes", "meses")} ${formatearUnidad(diasMostrar, "día", "días")}`;
  }

  if (edad !== "") {
    return unidadRaw ? `${edad} ${unidadRaw}` : edad;
  }

  return "No registrada";
}

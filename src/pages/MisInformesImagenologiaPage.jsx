import { useCallback, useEffect, useMemo, useState } from "react";
import { FiChevronDown, FiChevronUp, FiFileText, FiRefreshCw, FiTrash2, FiUser } from "react-icons/fi";
import { useNavigate } from "react-router-dom";
import Swal from "sweetalert2";
import CardInformeImagenologia from "../components/imagenologia/CardInformeImagenologia";
import Spinner from "../components/comunes/Spinner";
import { ModalSubir } from "./OrdenesImagenPacientePage";
import { authFetch } from "../utils/apiClient";

function detectarLayoutMobile() {
  if (typeof window === "undefined") return false;
  return window.innerWidth < 768;
}

const TIPO_LABEL = {
  todos: "Todos",
  ecografia: "Ecografías",
  rx: "Rayos X",
  tomografia: "Tomografías",
};

const ESTADO_LABEL = {
  pendiente: "Pendiente",
  completado: "Completado",
  cancelado: "Cancelado",
};

function nombrePaciente(paciente) {
  return [paciente?.nombre, paciente?.apellido].filter(Boolean).join(" ") || "Paciente sin nombre";
}

function parseIsoDate(value) {
  const raw = String(value || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return null;
  const [y, m, d] = raw.split("-").map((v) => Number(v));
  const date = new Date(y, m - 1, d);
  if (Number.isNaN(date.getTime())) return null;
  return date;
}

function formatearFechaNacimiento(value) {
  const date = parseIsoDate(value);
  if (!date) return "No registrada";
  const dd = String(date.getDate()).padStart(2, "0");
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const yyyy = String(date.getFullYear());
  return `${dd}/${mm}/${yyyy}`;
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

function resolverEdadDisplay(paciente) {
  const formatUnidad = (valor, singular, plural) => `${valor} ${Math.abs(Number(valor)) === 1 ? singular : plural}`;
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
    return `${formatUnidad(dias, "día", "días")} (${formatUnidad(meses, "mes", "meses")})`;
  }

  if (meses !== null && meses < 12) {
    return formatUnidad(meses, "mes", "meses");
  }

  if (anios !== null && anios >= 1) {
    const mesesMostrar = Number.isFinite(mesesResto) ? Math.max(0, mesesResto) : 0;
    const diasMostrar = Number.isFinite(diasResto) ? Math.max(0, diasResto) : 0;
    return `${formatUnidad(anios, "año", "años")} ${formatUnidad(mesesMostrar, "mes", "meses")} ${formatUnidad(diasMostrar, "día", "días")}`;
  }

  if (edad !== "") {
    return unidadRaw ? `${edad} ${unidadRaw}` : edad;
  }

  return "No registrada";
}

function formatearFechaSolicitud(fecha) {
  if (!fecha) return "Sin fecha";
  const fechaNormalizada = String(fecha).includes("T") ? String(fecha) : String(fecha).replace(" ", "T");
  const valor = new Date(fechaNormalizada);
  if (Number.isNaN(valor.getTime())) return String(fecha);
  return valor.toLocaleString("es-PE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });
}

function formatearFechaProgramada(fecha, hora) {
  const fechaTxt = String(fecha || "").trim();
  if (!fechaTxt) return "Sin programación";

  const partesFecha = fechaTxt.split("-");
  if (partesFecha.length !== 3) {
    return hora ? `${fechaTxt} ${String(hora).slice(0, 5)}` : fechaTxt;
  }

  const [yyyy, mm, dd] = partesFecha;
  const horaRaw = String(hora || "").trim();
  if (!horaRaw) {
    return `${dd}/${mm}/${yyyy}`;
  }

  const [hStr, minStr] = horaRaw.split(":");
  const h = Number(hStr || 0);
  const m = Number(minStr || 0);
  if (!Number.isFinite(h) || !Number.isFinite(m)) {
    return `${dd}/${mm}/${yyyy} ${horaRaw.slice(0, 5)}`;
  }

  const isPm = h >= 12;
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  const minute = String(m).padStart(2, "0");
  const ampm = isPm ? "PM" : "AM";
  return `${dd}/${mm}/${yyyy} ${String(hour12).padStart(2, "0")}:${minute} ${ampm}`;
}

export default function MisInformesImagenologiaPage({ usuario }) {
  const navigate = useNavigate();
  const [ordenes, setOrdenes] = useState([]);
  const [tipo, setTipo] = useState("todos");
  const [busqueda, setBusqueda] = useState("");
  const [pagina, setPagina] = useState(1);
  const [filasPorPagina, setFilasPorPagina] = useState(10);
  const [paginacion, setPaginacion] = useState({ page: 1, limit: 10, total: 0, total_pages: 1 });
  const [loading, setLoading] = useState(true);
  const [ordenParaSubir, setOrdenParaSubir] = useState(null);
  const [ordenExpandidaId, setOrdenExpandidaId] = useState(null);
  const [ordenInformeMobileId, setOrdenInformeMobileId] = useState(null);
  const [edicionInformeActiva, setEdicionInformeActiva] = useState(false);
  const [esMobileLayout, setEsMobileLayout] = useState(detectarLayoutMobile);
  const medicoId = Number(usuario?.id || 0);

  const cargarOrdenes = useCallback(async (opciones = {}) => {
    const { automatica = false } = opciones;
    if (automatica && edicionInformeActiva) {
      return;
    }
    if (!medicoId) {
      setOrdenes([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const response = await authFetch(`api_ordenes_imagen.php?medico_id=${medicoId}&tipo=${tipo}&page=${pagina}&limit=${filasPorPagina}`);
      const data = await response.json();
      if (!data.success) throw new Error(data.error || "No se pudieron cargar las órdenes");
      setOrdenes(Array.isArray(data.ordenes) ? data.ordenes : []);
      setPaginacion(data.pagination || { page: 1, limit: 10, total: 0, total_pages: 1 });
    } catch (error) {
      setOrdenes([]);
      Swal.fire("Error", error.message || "No se pudieron cargar las órdenes de imagenología.", "error");
    } finally {
      setLoading(false);
    }
  }, [edicionInformeActiva, filasPorPagina, medicoId, pagina, tipo]);

  useEffect(() => {
    cargarOrdenes({ automatica: true });
  }, [cargarOrdenes]);

  useEffect(() => {
    const onResize = () => setEsMobileLayout(detectarLayoutMobile());
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  const eliminarArchivo = async (archivo) => {
    const confirmacion = await Swal.fire({
      title: "¿Eliminar archivo?",
      text: archivo.nombre_original,
      icon: "warning",
      showCancelButton: true,
      confirmButtonText: "Sí, eliminar",
      cancelButtonText: "Cancelar",
    });
    if (!confirmacion.isConfirmed) return;

    try {
      const response = await authFetch("api_ordenes_imagen.php", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "eliminar_archivo", archivo_id: archivo.id }),
      });
      const data = await response.json();
      if (!data.success) throw new Error(data.error || "No se pudo eliminar el archivo");
      await cargarOrdenes();
    } catch (error) {
      Swal.fire("Error", error.message || "No se pudo eliminar el archivo.", "error");
    }
  };

  const filtro = busqueda.trim().toLowerCase();
  const ordenesVisibles = ordenes.filter((orden) => {
    if (!filtro) return true;
    const paciente = orden.paciente || {};
    return [paciente.nombre, paciente.dni, orden.indicaciones, ...(orden.servicios_nombres || [])]
      .filter(Boolean)
      .join(" ")
      .toLowerCase()
      .includes(filtro);
  });

  return (
    <main className="min-h-full bg-slate-50 px-4 py-5 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-6xl">
        <header className="mb-5 flex flex-col gap-4 border-b border-slate-200 pb-5 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-cyan-700">Área médica</p>
            <h1 className="mt-1 text-2xl font-bold text-slate-900">Mis Informes de Imagenología</h1>
            <p className="mt-1 text-sm text-slate-600">Estudios asignados para cargar archivos, redactar y entregar informes.</p>
          </div>
          <button
            type="button"
            onClick={cargarOrdenes}
            disabled={loading || edicionInformeActiva}
            title={edicionInformeActiva ? "Guarda o cierra el informe antes de actualizar" : "Actualizar órdenes"}
            className="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-slate-300 bg-white px-3 text-sm font-medium text-slate-700 hover:bg-slate-100 disabled:opacity-50"
          >
            <FiRefreshCw aria-hidden="true" /> Actualizar
          </button>
        </header>

        <section className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap gap-2" role="tablist" aria-label="Tipo de estudio">
            {Object.entries(TIPO_LABEL).map(([key, label]) => (
              <button
                key={key}
                type="button"
                role="tab"
                aria-selected={tipo === key}
                onClick={() => { setTipo(key); setPagina(1); }}
                className={`rounded-md px-3 py-2 text-sm font-medium ${tipo === key ? "bg-cyan-700 text-white" : "border border-slate-300 bg-white text-slate-700 hover:bg-slate-100"}`}
              >
                {label}
              </button>
            ))}
          </div>
          <input
            value={busqueda}
            onChange={(event) => setBusqueda(event.target.value)}
            placeholder="Buscar por paciente, DNI o estudio"
            className="h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-800 outline-none focus:border-cyan-600 sm:max-w-sm"
          />
        </section>

        {loading ? (
          <div className="py-16"><Spinner /></div>
        ) : ordenesVisibles.length === 0 ? (
          <section className="border border-dashed border-slate-300 bg-white px-6 py-14 text-center">
            <FiFileText className="mx-auto mb-3 text-3xl text-slate-400" />
            <h2 className="text-base font-semibold text-slate-800">No hay estudios asignados</h2>
            <p className="mt-1 text-sm text-slate-500">Los estudios aparecerán aquí cuando recepción o administración los asigne a tu cuenta.</p>
          </section>
        ) : (
          <>
            {!esMobileLayout && (
            <section className="overflow-hidden border border-slate-200 bg-white shadow-sm">
              <div className="grid grid-cols-[minmax(175px,1.2fr)_minmax(175px,1.1fr)_150px_110px_80px_105px_150px] gap-4 border-b border-slate-200 bg-slate-100 px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-600">
                <span>Paciente</span>
                <span>Estudio</span>
                <span>Programado</span>
                <span>Origen</span>
                <span>Archivos</span>
                <span>Informe</span>
                <span className="text-right">Acciones</span>
              </div>
              {ordenesVisibles.map((orden) => {
                const paciente = orden.paciente || {};
                const tieneConsulta = Number(orden.consulta_id || 0) > 0;
                const expandida = ordenExpandidaId === orden.id;
                const puedeGestionar = Boolean(orden.can_upload_archivos) && orden.estado !== "cancelado";
                const puedeInformar = Boolean(orden.can_edit_informe) && orden.estado !== "cancelado";
                return (
                  <div key={orden.id} className="border-b border-slate-200 last:border-b-0">
                    <div className="grid grid-cols-[minmax(175px,1.2fr)_minmax(175px,1.1fr)_150px_110px_80px_105px_150px] items-center gap-4 px-4 py-3 text-sm text-slate-700 hover:bg-slate-50">
                      <div className="min-w-0">
                        <p className="truncate font-semibold text-slate-900">{nombrePaciente(paciente)}</p>
                        <p className="mt-0.5 text-xs text-slate-500">DNI: {paciente.dni || "No registrado"}</p>
                        <p className="mt-0.5 text-xs text-slate-500">F. nac: {formatearFechaNacimiento(paciente.fecha_nacimiento)}</p>
                        <p className="mt-0.5 text-xs text-slate-500">Edad: {resolverEdadDisplay(paciente)}</p>
                      </div>
                      <div className="min-w-0">
                        <p className="font-medium">{TIPO_LABEL[orden.tipo] || orden.tipo}</p>
                        <p className="mt-0.5 truncate text-xs text-slate-500">{(orden.servicios_nombres || []).join(" · ") || "Sin descripción"}</p>
                      </div>
                      <div className="min-w-0">
                        <p className="text-xs text-slate-700">{formatearFechaProgramada(orden.fecha_programada, orden.hora_programada)}</p>
                        <p className="mt-0.5 text-xs text-slate-500">Solicitado: {formatearFechaSolicitud(orden.fecha)}</p>
                      </div>
                      <span className="text-xs text-slate-600">{tieneConsulta ? "Consulta" : "Atención directa"}</span>
                      <span className="text-xs font-medium text-slate-700">{orden.archivos?.length || 0}</span>
                      <span className={`inline-flex w-fit rounded-full px-2 py-1 text-xs font-semibold ${orden.estado === "cancelado" ? "bg-red-100 text-red-700" : orden.estado === "completado" ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-800"}`}>
                        {ESTADO_LABEL[orden.estado] || orden.estado}
                      </span>
                      <div className="flex items-center justify-end gap-2">
                        {puedeGestionar && <button type="button" onClick={() => setOrdenParaSubir(orden)} className="text-xs font-semibold text-cyan-700 hover:text-cyan-900">Subir</button>}
                        <button type="button" onClick={() => navigate(`/visor-imagen/${orden.id}`)} className="text-xs font-semibold text-cyan-700 hover:text-cyan-900">Visor</button>
                        <button type="button" onClick={() => setOrdenExpandidaId(expandida ? null : orden.id)} title={expandida ? "Ocultar detalle" : "Ver detalle"} className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-slate-300 text-slate-600 hover:bg-slate-100">
                          {expandida ? <FiChevronUp aria-hidden="true" /> : <FiChevronDown aria-hidden="true" />}
                        </button>
                      </div>
                    </div>
                    {expandida && (
                      <div className="grid grid-cols-[minmax(0,1fr)_minmax(300px,420px)] gap-5 border-t border-slate-200 bg-slate-50 px-5 py-4">
                        <div>
                          <h2 className="text-sm font-semibold text-slate-800">Archivos del estudio</h2>
                          {(orden.archivos || []).length === 0 ? <p className="mt-2 text-sm text-slate-500">Sin archivos cargados.</p> : (
                            <div className="mt-2 space-y-2">
                              {orden.archivos.map((archivo) => (
                                <div key={archivo.id} className="flex min-w-0 items-center gap-2 rounded-md border border-slate-200 bg-white px-3 py-2 text-xs text-slate-700">
                                  <a href={archivo.url} target="_blank" rel="noreferrer" className="min-w-0 flex-1 truncate font-medium text-cyan-700 hover:text-cyan-900">{archivo.nombre_original}</a>
                                  <span className="shrink-0 text-slate-400">{archivo.es_dicom ? "DICOM" : archivo.es_imagen ? "Imagen" : "PDF"}</span>
                                  {puedeGestionar && <button type="button" onClick={() => eliminarArchivo(archivo)} title={`Eliminar ${archivo.nombre_original}`} className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-red-600 hover:bg-red-100"><FiTrash2 aria-hidden="true" /></button>}
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                        <CardInformeImagenologia ordenImagenId={orden.id} tipoExamen={orden.tipo} pacienteNombre={nombrePaciente(paciente)} medicoNombre={[orden.medico_responsable_nombre, orden.medico_responsable_apellido].filter(Boolean).join(" ")} canEdit={puedeInformar} onInformeActualizado={cargarOrdenes} onEditingChange={setEdicionInformeActiva} />
                      </div>
                    )}
                  </div>
                );
              })}
            </section>
            )}
            <nav className="mt-4 flex flex-col gap-3 border-t border-slate-200 pt-4 sm:flex-row sm:items-center sm:justify-between" aria-label="Paginación de informes">
                <div className="flex items-center gap-2 text-sm text-slate-600">
                  <label htmlFor="filas-informes-imagen" className="font-medium">Filas por página</label>
                  <select
                    id="filas-informes-imagen"
                    value={filasPorPagina}
                    onChange={(event) => { setFilasPorPagina(Number(event.target.value)); setPagina(1); }}
                    className="h-9 rounded-md border border-slate-300 bg-white px-2 text-sm text-slate-700"
                  >
                    <option value={5}>5</option>
                    <option value={10}>10</option>
                    <option value={20}>20</option>
                    <option value={50}>50</option>
                  </select>
                  <span>Página {paginacion.page} de {paginacion.total_pages} · {paginacion.total} estudios</span>
                </div>
                <div className="flex gap-2">
                  <button type="button" onClick={() => setPagina((actual) => Math.max(1, actual - 1))} disabled={paginacion.page <= 1} className="h-9 rounded-md border border-slate-300 bg-white px-3 text-sm font-medium text-slate-700 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50">Anterior</button>
                  <button type="button" onClick={() => setPagina((actual) => Math.min(paginacion.total_pages, actual + 1))} disabled={paginacion.page >= paginacion.total_pages} className="h-9 rounded-md border border-slate-300 bg-white px-3 text-sm font-medium text-slate-700 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50">Siguiente</button>
                </div>
            </nav>
            {esMobileLayout && (
            <section className="grid gap-4">
            {ordenesVisibles.map((orden) => {
              const paciente = orden.paciente || {};
              const tieneConsulta = Number(orden.consulta_id || 0) > 0;
              const informeAbierto = ordenInformeMobileId === orden.id;
              return (
                <article key={orden.id} className="border border-slate-200 bg-white p-4 shadow-sm">
                  <div className="mb-4 flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                        <FiUser className="shrink-0 text-cyan-700" />
                        <span className="truncate">{nombrePaciente(paciente)}</span>
                      </div>
                      <p className="mt-1 text-xs text-slate-500">DNI: {paciente.dni || "No registrado"}</p>
                      <p className="mt-1 text-xs text-slate-500">F. nac: {formatearFechaNacimiento(paciente.fecha_nacimiento)}</p>
                      <p className="mt-1 text-xs text-slate-500">Edad: {resolverEdadDisplay(paciente)}</p>
                      <p className="mt-2 text-sm font-medium capitalize text-slate-700">{TIPO_LABEL[orden.tipo] || orden.tipo}</p>
                      {(orden.servicios_nombres || []).length > 0 && <p className="mt-1 text-xs text-slate-500">{orden.servicios_nombres.join(" · ")}</p>}
                      <p className="mt-1 text-xs text-slate-500">Programado: {formatearFechaProgramada(orden.fecha_programada, orden.hora_programada)}</p>
                      <p className="mt-1 text-xs text-slate-500">Solicitado: {formatearFechaSolicitud(orden.fecha)}</p>
                    </div>
                    <div className="shrink-0 text-right">
                      <span className={`inline-flex rounded-full px-2 py-1 text-xs font-semibold ${orden.estado === "cancelado" ? "bg-red-100 text-red-700" : orden.estado === "completado" ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-800"}`}>
                        {ESTADO_LABEL[orden.estado] || orden.estado}
                      </span>
                      <p className="mt-2 text-xs text-slate-500">{tieneConsulta ? "Origen: consulta" : "Origen: atención directa"}</p>
                    </div>
                  </div>

                  <div className="mb-4 flex items-center justify-between gap-3 border-y border-slate-100 py-3 text-xs text-slate-600">
                    <span>{orden.archivos?.length || 0} archivo(s) adjunto(s)</span>
                    <div className="flex items-center gap-3">
                      {Boolean(orden.can_upload_archivos) && orden.estado !== "cancelado" && (
                        <button
                          type="button"
                          onClick={() => setOrdenParaSubir(orden)}
                          className="font-semibold text-cyan-700 hover:text-cyan-900"
                        >
                          Subir imágenes
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => navigate(`/visor-imagen/${orden.id}`)}
                        className="font-semibold text-cyan-700 hover:text-cyan-900"
                      >
                        Abrir estudio
                      </button>
                    </div>
                  </div>

                  {(orden.archivos || []).length > 0 && (
                    <div className="mb-4 space-y-2">
                      {orden.archivos.map((archivo) => (
                        <div key={archivo.id} className="flex min-w-0 items-center gap-2 rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-700">
                          <a href={archivo.url} target="_blank" rel="noreferrer" className="min-w-0 flex-1 truncate font-medium text-cyan-700 hover:text-cyan-900">
                            {archivo.nombre_original}
                          </a>
                          <span className="shrink-0 text-slate-400">{archivo.es_dicom ? "DICOM" : archivo.es_imagen ? "Imagen" : "PDF"}</span>
                          {Boolean(orden.can_upload_archivos) && orden.estado !== "cancelado" && (
                            <button
                              type="button"
                              onClick={() => eliminarArchivo(archivo)}
                              title={`Eliminar ${archivo.nombre_original}`}
                              className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-red-600 hover:bg-red-100"
                            >
                              <FiTrash2 aria-hidden="true" />
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  )}

                  <div className="mt-3 border-t border-slate-100 pt-3">
                    <button
                      type="button"
                      onClick={() => setOrdenInformeMobileId((actual) => (actual === orden.id ? null : orden.id))}
                      className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100"
                    >
                      {informeAbierto ? "Ocultar informe" : "Ver informe"}
                    </button>
                    {informeAbierto && (
                      <div className="mt-3">
                        <CardInformeImagenologia
                          ordenImagenId={orden.id}
                          tipoExamen={orden.tipo}
                          pacienteNombre={nombrePaciente(paciente)}
                          medicoNombre={[orden.medico_responsable_nombre, orden.medico_responsable_apellido].filter(Boolean).join(" ")}
                          canEdit={Boolean(orden.can_edit_informe) && orden.estado !== "cancelado"}
                          onInformeActualizado={cargarOrdenes}
                          onEditingChange={setEdicionInformeActiva}
                        />
                      </div>
                    )}
                  </div>
                </article>
              );
            })}
            </section>
            )}
          </>
        )}
      </div>
      {ordenParaSubir && (
        <ModalSubir
          orden={ordenParaSubir}
          onClose={() => setOrdenParaSubir(null)}
          onSubido={cargarOrdenes}
        />
      )}
    </main>
  );
}
import { useCallback, useEffect, useRef, useState } from "react";
import { historialPaciente } from "../../api/seguimientoClinicoApi";
import { formatearFechaCorta, formatearHora, insigniaEstado, paginasVisibles, textoDiagnostico } from "../../utils/seguimientoClinico";
import DetalleConsulta from "./DetalleConsulta";

const POR_PAGINA = 10;

function Contador({ valor, etiqueta }) {
  if (!valor) return null;
  return <span className="rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[11px] text-slate-700">{etiqueta} {valor}</span>;
}

/** Línea de tiempo ligera del paciente (más reciente primero); el contenido de cada HC se carga al abrirla. */
export default function LineaTiempo({ paciente }) {
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [pagina, setPagina] = useState(1);
  const [estado, setEstado] = useState({ cargando: true, error: "" });
  const [abierta, setAbierta] = useState(null);

  const cargar = useCallback(async (pag) => {
    setEstado({ cargando: true, error: "" });
    try {
      const r = await historialPaciente(paciente.id, pag, POR_PAGINA);
      setItems(r.items);
      setTotal(r.total);
      setPagina(pag);
      setAbierta(null);
      setEstado({ cargando: false, error: "" });
    } catch (e) {
      setEstado({ cargando: false, error: e.message || "No se pudo cargar el historial" });
    }
  }, [paciente.id]);

  useEffect(() => {
    setItems([]);
    setTotal(0);
    setAbierta(null);
    cargar(1);
  }, [cargar]);

  const cabecera = useRef(null);
  const irAPagina = (n) => {
    cabecera.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    cargar(n);
  };

  const totalPaginas = Math.max(1, Math.ceil(total / POR_PAGINA));
  const desde = total === 0 ? 0 : (pagina - 1) * POR_PAGINA + 1;
  const hasta = Math.min(total, pagina * POR_PAGINA);
  const claseBoton = (activo) =>
    `min-w-[2rem] rounded-lg border px-2.5 py-1 text-xs font-semibold disabled:cursor-not-allowed disabled:opacity-50 ${
      activo ? "border-blue-600 bg-blue-600 text-white" : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
    }`;

  return (
    <div ref={cabecera} className="scroll-mt-4">
      <div className="mb-3 flex flex-wrap items-baseline justify-between       gap-2">
        <h3 className="text-sm font-bold text-slate-800">Historial cronológico</h3>
        <span className="text-xs text-slate-500">{total} atención(es) registradas</span>
      </div>

      {estado.error && <p className="mb-2 text-xs text-red-600" role="alert">{estado.error}</p>}
      {!estado.cargando && !estado.error && items.length === 0 && <p className="text-sm text-slate-500">Este paciente no tiene atenciones registradas.</p>}

      <ol className="space-y-3">
        {items.map((it) => {
          const est = insigniaEstado(it.estado);
          const abiertaEsta = abierta === it.consulta_id;
          return (
            <li key={it.consulta_id} className={`rounded-xl border bg-white p-3 ${it.es_mia ? "border-blue-300" : "border-slate-200"}`}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="text-sm font-semibold text-slate-800">
                    {formatearFechaCorta(it.fecha)} <span className="font-normal text-slate-500">{formatearHora(it.hora)}</span>
                    {it.es_control && <span className="ml-2 rounded bg-cyan-100 px-1.5 py-0.5 text-[10px] font-semibold text-cyan-800">Control</span>}
                  </p>
                  <p className="text-xs text-slate-600">
                    {it.medico.nombre || "Médico no registrado"}{it.medico.especialidad ? ` · ${it.medico.especialidad}` : ""}
                    {it.es_mia && <span className="ml-2 font-semibold text-blue-700">Mi consulta</span>}
                  </p>
                </div>
                <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${est.clase}`}>{est.texto}</span>
              </div>

              <p className="mt-2 text-sm text-slate-800">{textoDiagnostico(it)}</p>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <Contador valor={it.recetas} etiqueta="Receta" />
                <Contador valor={it.laboratorio} etiqueta="Laboratorio" />
                <Contador valor={it.imagenologia} etiqueta="Imagen" />
                {it.tiene_hc && (
                  <button
                    type="button"
                    className="ml-auto rounded-lg border border-blue-300 bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-800 hover:bg-blue-100"
                    onClick={() => setAbierta(abiertaEsta ? null : it.consulta_id)}
                    aria-expanded={abiertaEsta}
                  >
                    {abiertaEsta ? "Ocultar detalle" : "Ver detalle"}
                  </button>
                )}
              </div>
              {abiertaEsta && <div className="mt-3"><DetalleConsulta consultaId={it.consulta_id} /></div>}
            </li>
          );
        })}
      </ol>

      {estado.cargando && <p className="mt-3 text-xs text-slate-500">Cargando...</p>}
      {totalPaginas > 1 && (
        <nav className="mt-4 flex flex-wrap items-center justify-between gap-2" aria-label="Paginación del historial">
          <span className="text-xs text-slate-500">
            Mostrando {desde}–{hasta} de {total}
          </span>
          <div className="flex flex-wrap items-center gap-1">
            <button type="button" className={claseBoton(false)} disabled={estado.cargando || pagina <= 1} onClick={() => irAPagina(pagina - 1)}>
              Anterior
            </button>
            {paginasVisibles(pagina, totalPaginas).map((n, i) =>
              n === null ? (
                <span key={`salto-${i}`} className="px-1 text-xs text-slate-400" aria-hidden="true">…</span>
              ) : (
                <button
                  key={n}
                  type="button"
                  className={claseBoton(n === pagina)}
                  disabled={estado.cargando}
                  aria-current={n === pagina ? "page" : undefined}
                  aria-label={`Página ${n}`}
                  onClick={() => n !== pagina && irAPagina(n)}
                >
                  {n}
                </button>
              )
            )}
            <button type="button" className={claseBoton(false)} disabled={estado.cargando || pagina >= totalPaginas} onClick={() => irAPagina(pagina + 1)}>
              Siguiente
            </button>
          </div>
        </nav>
      )}
    </div>
  );
}

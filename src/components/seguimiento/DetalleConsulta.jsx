import { useEffect, useState } from "react";
import { detalleConsultaSeguimiento } from "../../api/seguimientoClinicoApi";
import { camposVisiblesHc, etiquetaClave, esValorVacio, formatearFechaCorta, formatearHora } from "../../utils/seguimientoClinico";

function Tabla({ columnas, filas }) {
  return (
    <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
      <table className="min-w-full divide-y divide-slate-200 text-xs">
        <thead className="bg-slate-100">
          <tr>
            {columnas.map((c) => (
              <th key={c.clave} className="px-3 py-2 text-left font-semibold text-slate-700">{c.titulo}</th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {filas.map((f, i) => (
            <tr key={i} className="align-top">
              {columnas.map((c) => (
                <td key={c.clave} className="whitespace-pre-wrap px-3 py-2 text-slate-800">{String(f[c.clave] ?? "").trim() || "-"}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// Valor genérico (texto, lista u objeto anidado) de campos propios de cada plantilla de HC.
function Valor({ valor, nivel = 0 }) {
  if (valor === null || valor === undefined) return null;
  if (typeof valor === "boolean") return <span>{valor ? "Sí" : "No"}</span>;
  if (typeof valor !== "object") return <span className="whitespace-pre-wrap">{String(valor)}</span>;
  if (Array.isArray(valor)) {
    const items = valor.filter((v) => !esValorVacio(v));
    return (
      <ul className="ml-4 list-disc space-y-1">
        {items.map((v, i) => (
          <li key={i}><Valor valor={v} nivel={nivel + 1} /></li>
        ))}
      </ul>
    );
  }
  const pares = Object.entries(valor).filter(([, v]) => !esValorVacio(v));
  return (
    <dl className={`space-y-1 ${nivel > 0 ? "ml-2" : ""}`}>
      {pares.map(([k, v]) => (
        <div key={k}>
          <dt className="inline font-medium text-slate-600">{etiquetaClave(k)}: </dt>
          <dd className="inline"><Valor valor={v} nivel={nivel + 1} /></dd>
        </div>
      ))}
    </dl>
  );
}

function CampoHc({ campo }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-3 py-2">
      <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-500">{campo.etiqueta}</p>
      {campo.tipo === "diagnosticos" && (
        <Tabla
          columnas={[{ clave: "codigo", titulo: "Código" }, { clave: "nombre", titulo: "Diagnóstico" }, { clave: "tipo", titulo: "Tipo" }, { clave: "observaciones", titulo: "Observaciones" }]}
          filas={campo.valor}
        />
      )}
      {campo.tipo === "receta" && (
        <Tabla
          columnas={[{ clave: "nombre", titulo: "Medicamento" }, { clave: "dosis", titulo: "Dosis" }, { clave: "frecuencia", titulo: "Frecuencia" }, { clave: "duracion", titulo: "Duración" }, { clave: "observaciones", titulo: "Indicaciones" }]}
          filas={campo.valor}
        />
      )}
      {(campo.tipo === "texto" || campo.tipo === "lista" || campo.tipo === "objeto") && (
        <div className="text-sm text-slate-800"><Valor valor={campo.valor} /></div>
      )}
    </div>
  );
}

function Seccion({ titulo, children }) {
  return (
    <section className="space-y-2">
      <h4 className="text-xs font-bold uppercase tracking-wide text-blue-800">{titulo}</h4>
      {children}
    </section>
  );
}

/** Todo lo guardado de una consulta, cargado solo al abrirla (cada apertura queda registrada en el servidor). */
export default function DetalleConsulta({ consultaId }) {
  const [estado, setEstado] = useState({ cargando: true, error: "", datos: null });

  useEffect(() => {
    let cancelado = false;
    setEstado({ cargando: true, error: "", datos: null });
    detalleConsultaSeguimiento(consultaId)
      .then((datos) => !cancelado && setEstado({ cargando: false, error: "", datos }))
      .catch((e) => !cancelado && setEstado({ cargando: false, error: e.message || "No se pudo cargar el detalle", datos: null }));
    return () => {
      cancelado = true;
    };
  }, [consultaId]);

  if (estado.cargando) return <p className="text-xs text-slate-500">Cargando detalle...</p>;
  if (estado.error) return <p className="text-xs text-red-600" role="alert">{estado.error}</p>;

  const { historia_clinica: hc, triaje, laboratorio = [], imagenologia = [] } = estado.datos;
  const campos = camposVisiblesHc(hc?.datos);
  const triajeCampos = camposVisiblesHc(triaje?.datos);

  return (
    <div className="space-y-4 border-t border-slate-100 pt-3">
      {triaje && triajeCampos.length > 0 && (
        <Seccion titulo={`Triaje${triaje.registrado_por ? ` · ${triaje.registrado_por}` : ""}`}>
          <div className="grid gap-2 sm:grid-cols-2">{triajeCampos.map((c) => <CampoHc key={c.clave} campo={c} />)}</div>
        </Seccion>
      )}

      <Seccion titulo="Historia clínica">
        {hc ? (
          campos.length > 0
            ? <div className="space-y-2">{campos.map((c) => <CampoHc key={c.clave} campo={c} />)}</div>
            : <p className="text-xs text-slate-500">La historia clínica está registrada sin contenido.</p>
        ) : (
          <p className="text-xs text-slate-500">Esta consulta no tiene historia clínica guardada.</p>
        )}
      </Seccion>

      {laboratorio.length > 0 && (
        <Seccion titulo="Laboratorio">
          {laboratorio.map((o) => (
            <div key={o.orden_id} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs">
              <p className="font-semibold text-slate-700">Orden #{o.orden_id} · {formatearFechaCorta(o.fecha)} · {o.estado}</p>
              <p className="text-slate-600">{o.examenes.join(", ") || "Sin exámenes"}</p>
              {o.resultados.map((r, i) => r.parametros.length > 0 && (
                <div key={i} className="mt-2">
                  <p className="font-medium text-slate-700">{r.examen}</p>
                  <Tabla
                    columnas={[{ clave: "nombre", titulo: "Parámetro" }, { clave: "valor", titulo: "Resultado" }, { clave: "unidad", titulo: "Unidad" }, { clave: "referencia", titulo: "Referencia" }]}
                    filas={r.parametros}
                  />
                </div>
              ))}
              {o.resultados.every((r) => r.parametros.length === 0) && <p className="mt-1 text-slate-500">Sin resultados cargados.</p>}
            </div>
          ))}
        </Seccion>
      )}

      {imagenologia.length > 0 && (
        <Seccion titulo="Imagenología">
          {imagenologia.map((o) => (
            <div key={o.orden_id} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs">
              <p className="font-semibold text-slate-700">{o.tipo || "Estudio"} · {formatearFechaCorta(o.fecha)} · {o.estado}{o.archivos > 0 ? ` · ${o.archivos} archivo(s) adjunto(s)` : ""}</p>
              {o.indicaciones && <p className="whitespace-pre-wrap text-slate-600">{o.indicaciones}</p>}
              {o.informe ? (
                <div className="mt-2">
                  <p className="font-medium text-slate-700">{o.informe.titulo} ({o.informe.estado})</p>
                  <div className="text-slate-800"><Valor valor={o.informe.contenido} /></div>
                </div>
              ) : (
                <p className="mt-1 text-slate-500">Sin informe redactado.</p>
              )}
            </div>
          ))}
        </Seccion>
      )}

      <p className="text-[11px] text-slate-400">
        Consulta del {formatearFechaCorta(estado.datos.consulta.fecha)} {formatearHora(estado.datos.consulta.hora)} · {estado.datos.consulta.medico.nombre}. Los adjuntos y archivos se consultan desde la historia clínica del paciente.
      </p>
    </div>
  );
}

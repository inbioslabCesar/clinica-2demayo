import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { BASE_URL } from "../config/config";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";

export default function LaboratorioCompararResultadosPage() {
  const navigate = useNavigate();
  const { pacienteId } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [data, setData] = useState(null);

  const parametro = searchParams.get("parametro") || "";
  const alcance = searchParams.get("alcance") || "90d";

  useEffect(() => {
    let cancelled = false;

    const cargar = async () => {
      setLoading(true);
      setError("");

      try {
        const qs = new URLSearchParams();
        qs.set("paciente_id", String(pacienteId || ""));
        qs.set("alcance", alcance);
        if (parametro) qs.set("parametro", parametro);

        const res = await fetch(`${BASE_URL}api_laboratorio_comparar_resultados.php?${qs.toString()}`, {
          credentials: "include",
        });
        const json = await res.json();

        if (!res.ok || !json?.success) {
          throw new Error(json?.error || "No se pudo cargar comparación");
        }

        if (!cancelled) {
          setData(json);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err?.message || "Error al cargar comparación");
          setData(null);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    cargar();
    return () => {
      cancelled = true;
    };
  }, [pacienteId, parametro, alcance]);

  const chartData = useMemo(() => {
    const serie = Array.isArray(data?.serie) ? data.serie : [];
    return serie
      .filter((r) => r?.valor_num !== null && r?.valor_num !== undefined)
      .map((r) => ({
        fecha: r?.fecha ? new Date(r.fecha).toLocaleDateString("es-ES") : "-",
        valor: Number(r.valor_num),
        refMin: r.ref_min === null || r.ref_min === undefined ? null : Number(r.ref_min),
        refMax: r.ref_max === null || r.ref_max === undefined ? null : Number(r.ref_max),
      }));
  }, [data]);

  const onParametroChange = (value) => {
    const next = new URLSearchParams(searchParams);
    if (value) next.set("parametro", value);
    else next.delete("parametro");
    setSearchParams(next);
  };

  const onAlcanceChange = (value) => {
    const next = new URLSearchParams(searchParams);
    next.set("alcance", value);
    setSearchParams(next);
  };

  const resumen = data?.resumen || {};

  const buildExportUrl = (type) => {
    const qs = new URLSearchParams();
    qs.set("paciente_id", String(pacienteId || ""));
    qs.set("alcance", alcance || "90d");
    if (data?.parametro_seleccionado) qs.set("parametro", data.parametro_seleccionado);
    qs.set("export", type);
    return `${BASE_URL}api_laboratorio_comparar_resultados.php?${qs.toString()}`;
  };

  return (
    <div className="max-w-7xl mx-auto p-4 md:p-6 space-y-4">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-purple-800">Comparación de resultados</h1>
          <p className="text-sm text-gray-600">
            Paciente: <strong>{`${data?.paciente?.nombre || ""} ${data?.paciente?.apellido || ""}`.trim() || "-"}</strong>
            {" "}| DNI: <strong>{data?.paciente?.dni || "-"}</strong>
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => navigate("/panel-laboratorio")}
            className="px-3 py-2 rounded-lg border border-gray-300 bg-white hover:bg-gray-50 text-sm"
          >
            ← Volver a panel laboratorio
          </button>
          <a
            href={buildExportUrl("excel")}
            target="_blank"
            rel="noreferrer"
            className={`px-3 py-2 rounded-lg text-sm border ${(!data?.parametros_disponibles?.length || loading) ? 'pointer-events-none opacity-50 border-gray-200 text-gray-400 bg-gray-50' : 'border-emerald-300 text-emerald-700 bg-emerald-50 hover:bg-emerald-100'}`}
          >
            Exportar Excel
          </a>
          <a
            href={buildExportUrl("pdf")}
            target="_blank"
            rel="noreferrer"
            className={`px-3 py-2 rounded-lg text-sm border ${(!data?.parametros_disponibles?.length || loading) ? 'pointer-events-none opacity-50 border-gray-200 text-gray-400 bg-gray-50' : 'border-rose-300 text-rose-700 bg-rose-50 hover:bg-rose-100'}`}
          >
            Exportar PDF
          </a>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Parámetro a comparar</label>
            <select
              value={data?.parametro_seleccionado || parametro}
              onChange={(e) => onParametroChange(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2"
              disabled={loading || !Array.isArray(data?.parametros_disponibles) || data.parametros_disponibles.length === 0}
            >
              {(data?.parametros_disponibles || []).map((opt) => (
                <option key={opt.llave} value={opt.llave}>{`${opt.examen} · ${opt.parametro}`}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Alcance</label>
            <select
              value={alcance}
              onChange={(e) => onAlcanceChange(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2"
              disabled={loading}
            >
              <option value="30d">Últimos 30 días</option>
              <option value="90d">Últimos 90 días</option>
              <option value="all">Todo histórico</option>
            </select>
          </div>
        </div>
      </div>

      {loading && <div className="p-4 text-sm text-purple-700">Cargando comparación...</div>}
      {error && <div className="p-4 rounded-lg bg-red-50 text-red-700 border border-red-200">{error}</div>}

      {!loading && !error && (
        <>
          {!data?.parametros_disponibles?.length ? (
            <div className="p-4 rounded-lg bg-blue-50 text-blue-700 border border-blue-200">
              No hay resultados completados para este paciente.
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div className="bg-white rounded-lg border border-blue-200 p-3">
                  <div className="text-xs text-gray-500">Último valor</div>
                  <div className="font-bold text-blue-700">
                    {resumen?.ultimo ? `${resumen.ultimo.valor_raw || "-"}${resumen.ultimo.unidad ? ` ${resumen.ultimo.unidad}` : ""}` : "Sin dato"}
                  </div>
                </div>
                <div className="bg-white rounded-lg border border-gray-200 p-3">
                  <div className="text-xs text-gray-500">Valor anterior</div>
                  <div className="font-bold text-gray-700">
                    {resumen?.anterior ? `${resumen.anterior.valor_raw || "-"}${resumen.anterior.unidad ? ` ${resumen.anterior.unidad}` : ""}` : "Sin dato"}
                  </div>
                </div>
                <div className="bg-white rounded-lg border border-amber-200 p-3">
                  <div className="text-xs text-gray-500">Diferencia</div>
                  <div className="font-bold text-amber-700">{resumen?.delta_abs === null || resumen?.delta_abs === undefined ? "Sin dato" : Number(resumen.delta_abs).toFixed(2)}</div>
                </div>
                <div className="bg-white rounded-lg border border-emerald-200 p-3">
                  <div className="text-xs text-gray-500">Variación (%)</div>
                  <div className="font-bold text-emerald-700">{resumen?.delta_pct === null || resumen?.delta_pct === undefined ? "Sin dato" : `${Number(resumen.delta_pct).toFixed(2)}%`}</div>
                </div>
              </div>

              <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
                <div className="flex flex-wrap items-center gap-2 mb-3">
                  <span className="text-xs px-2 py-1 rounded bg-gray-900 text-white">Tendencia: {resumen?.tendencia || "Sin datos"}</span>
                  <span className="text-xs px-2 py-1 rounded bg-gray-100 text-gray-700">Registros: {resumen?.registros || 0}</span>
                </div>
                {Array.isArray(data?.alertas) && data.alertas.length > 0 && (
                  <div className="bg-amber-50 border border-amber-200 text-amber-800 rounded-lg px-3 py-2 text-sm">
                    <div className="font-semibold mb-1">Alertas</div>
                    <ul className="list-disc list-inside space-y-1">
                      {data.alertas.map((a, i) => (
                        <li key={`${a}-${i}`}>{a}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>

              <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
                <h3 className="font-semibold text-gray-800 mb-3">Tendencia del parámetro</h3>
                {chartData.length > 0 ? (
                  <div className="h-64">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={chartData}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="fecha" />
                        <YAxis />
                        <Tooltip />
                        <Legend />
                        <Line type="monotone" dataKey="valor" stroke="#2563eb" name="Resultado" strokeWidth={2} />
                        <Line type="monotone" dataKey="refMin" stroke="#16a34a" name="Ref. mínima" strokeDasharray="5 5" dot={false} />
                        <Line type="monotone" dataKey="refMax" stroke="#dc2626" name="Ref. máxima" strokeDasharray="5 5" dot={false} />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                ) : (
                  <div className="text-sm text-gray-500">No hay suficientes datos numéricos para graficar.</div>
                )}
              </div>

              <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                <div className="px-4 py-3 border-b bg-gray-50 flex justify-between">
                  <h3 className="font-semibold text-gray-800">Histórico comparativo</h3>
                  <span className="text-xs px-2 py-1 rounded bg-gray-200 text-gray-700">{(data?.serie || []).length} registro(s)</span>
                </div>
                <div className="overflow-x-auto">
                  <table className="min-w-full text-sm">
                    <thead className="bg-gray-100 text-gray-700">
                      <tr>
                        <th className="px-3 py-2 text-left">Fecha</th>
                        <th className="px-3 py-2 text-left">Examen</th>
                        <th className="px-3 py-2 text-left">Parámetro</th>
                        <th className="px-3 py-2 text-left">Resultado</th>
                        <th className="px-3 py-2 text-left">Unidad</th>
                        <th className="px-3 py-2 text-left">Referencia</th>
                        <th className="px-3 py-2 text-left">Estado</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(data?.serie || []).length === 0 ? (
                        <tr>
                          <td colSpan={7} className="px-3 py-6 text-center text-gray-500">No hay datos para el parámetro seleccionado.</td>
                        </tr>
                      ) : (
                        (data?.serie || []).map((r, idx) => (
                          <tr key={`${r.fecha}-${idx}`} className="border-t">
                            <td className="px-3 py-2">{r.fecha_label || "-"}</td>
                            <td className="px-3 py-2">{r.examen || "-"}</td>
                            <td className="px-3 py-2">{r.parametro || "-"}</td>
                            <td className="px-3 py-2">{r.valor_raw || "-"}</td>
                            <td className="px-3 py-2">{r.unidad || "-"}</td>
                            <td className="px-3 py-2">{r.referencia || "-"}</td>
                            <td className="px-3 py-2">
                              {r.dentro_rango === true ? (
                                <span className="text-xs px-2 py-1 rounded bg-emerald-100 text-emerald-700">Dentro de rango</span>
                              ) : r.dentro_rango === false ? (
                                <span className="text-xs px-2 py-1 rounded bg-red-100 text-red-700">Fuera de rango</span>
                              ) : (
                                <span className="text-xs px-2 py-1 rounded bg-gray-100 text-gray-600">Sin evaluar</span>
                              )}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { authFetch } from '../utils/apiClient';
import { Link } from 'react-router-dom';

const MESES_CORTOS = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

const SERVICIO_LABEL = {
  consulta: 'Consultas',
  rayosx: 'Rayos X',
  ecografia: 'Ecografía',
  laboratorio: 'Laboratorio',
  procedimiento: 'Procedimientos',
  procedimientos: 'Procedimientos',
  mixto: 'Paquetes / mixtos',
  paquete: 'Paquetes',
  operacion: 'Operaciones',
  cirugias: 'Cirugías',
  farmacia: 'Farmacia',
  contrato_abono: 'Abonos de contratos',
  descuentos_ajustes: 'Descuentos y ajustes',
  sin_detalle: 'Cobrado sin detalle de servicio',
  sin_desglose: 'Otros ingresos (sin desglose por servicio)',
  otros: 'Otros',
};

const NIVEL_ESTILO = {
  alto: 'bg-rose-50 border-rose-200 text-rose-800',
  medio: 'bg-amber-50 border-amber-200 text-amber-800',
  info: 'bg-sky-50 border-sky-200 text-sky-800',
};

const CONFIANZA_ESTILO = {
  baja: 'bg-rose-100 text-rose-700',
  media: 'bg-amber-100 text-amber-700',
  alta: 'bg-emerald-100 text-emerald-700',
};

const fmtMoney = (value) => {
  const n = Number(value);
  if (!Number.isFinite(n)) return '—';
  return `S/ ${n.toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

const fmtPct = (value) => (value === null || value === undefined || !Number.isFinite(Number(value)) ? '—' : `${Number(value).toFixed(1)}%`);

const toIso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

const rangoPreset = (preset) => {
  const hoy = new Date();
  if (preset === 'mes') return { desde: toIso(new Date(hoy.getFullYear(), hoy.getMonth(), 1)), hasta: toIso(hoy) };
  if (preset === 'mes_anterior') {
    return {
      desde: toIso(new Date(hoy.getFullYear(), hoy.getMonth() - 1, 1)),
      hasta: toIso(new Date(hoy.getFullYear(), hoy.getMonth(), 0)),
    };
  }
  if (preset === 'tres_meses') return { desde: toIso(new Date(hoy.getFullYear(), hoy.getMonth() - 2, 1)), hasta: toIso(hoy) };
  return { desde: toIso(new Date(hoy.getFullYear(), 0, 1)), hasta: toIso(hoy) };
};

const etiquetaMes = (yyyymm) => {
  const [y, m] = String(yyyymm || '').split('-');
  const idx = Number(m) - 1;
  return idx >= 0 && idx < 12 ? `${MESES_CORTOS[idx]} ${String(y).slice(2)}` : yyyymm;
};

function Variacion({ valor, sufijo = '%', invertir = false }) {
  if (valor === null || valor === undefined) return <span className="text-xs text-slate-400">sin período previo</span>;
  const positivo = invertir ? valor <= 0 : valor >= 0;
  return (
    <span className={`text-xs font-semibold ${positivo ? 'text-emerald-600' : 'text-rose-600'}`}>
      {valor >= 0 ? '▲' : '▼'} {Math.abs(valor).toFixed(1)}{sufijo} vs período anterior
    </span>
  );
}

function Kpi({ titulo, valor, pie, acento = 'text-slate-900' }) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 flex flex-col gap-1">
      <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">{titulo}</span>
      <span className={`text-2xl font-bold ${acento}`}>{valor}</span>
      <div>{pie}</div>
    </div>
  );
}

function Escenario({ nombre, datos, destacado }) {
  return (
    <div className={`rounded-lg border px-3 py-2 ${destacado ? 'border-indigo-300 bg-indigo-50' : 'border-slate-200 bg-white'}`}>
      <div className="text-[11px] font-semibold uppercase text-slate-500">{nombre}</div>
      <div className="text-sm font-bold text-slate-800">{fmtMoney(datos?.ingresos)}</div>
      <div className="text-xs text-emerald-700">Aporte: {fmtMoney(datos?.contribucion)}</div>
    </div>
  );
}

export default function RentabilidadClinicaPage() {
  const [rango, setRango] = useState(() => rangoPreset('mes'));
  const [preset, setPreset] = useState('mes');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [verSupuestos, setVerSupuestos] = useState(false);
  const [verSinActividad, setVerSinActividad] = useState(true);

  const cargar = useCallback(async (r) => {
    setLoading(true);
    setError('');
    try {
      const res = await authFetch(`api_rentabilidad_clinica.php?desde=${r.desde}&hasta=${r.hasta}`, { cache: 'no-store' });
      const json = await res.json();
      if (!json?.success) throw new Error(json?.error || 'No se pudo cargar la rentabilidad');
      setData(json);
    } catch (e) {
      setData(null);
      setError(e?.message || 'No se pudo cargar la rentabilidad');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    cargar(rango);
  }, [cargar, rango]);

  const aplicarPreset = (p) => {
    setPreset(p);
    setRango(rangoPreset(p));
  };

  const serieGrafico = useMemo(
    () => (data?.mensual || []).map((m) => ({ ...m, etiqueta: etiquetaMes(m.mes) })),
    [data]
  );

  const totalesMedicos = useMemo(() => {
    const filas = data?.por_medico || [];
    const sum = (campo) => filas.reduce((acc, f) => acc + Number(f[campo] || 0), 0);
    const ingresos = sum('ingresos');
    const honorarios = sum('honorarios');
    return {
      ingresos,
      honorarios,
      pagado: sum('honorario_pagado'),
      pendiente: sum('honorario_pendiente'),
      indicaciones: sum('indicaciones'),
      aporte: ingresos - honorarios,
    };
  }, [data]);

  const totalClinica = useMemo(() => {
    const propios = Number(data?.ingresos_propios?.total || 0);
    const hd = data?.honorarios_detalle || {};
    const ingresos = totalesMedicos.ingresos + propios;
    const honorarios = Number(data?.resumen?.honorarios || 0);
    return {
      propios,
      ingresos,
      honorarios,
      pagado: Number(hd.pagado || 0),
      pendiente: Number(hd.pendiente || 0),
      anulados: Number(hd.sobre_cobros_anulados || 0),
      sinMedico: Number(hd.sin_medico || 0),
      aporte: ingresos - honorarios,
    };
  }, [data, totalesMedicos]);

  const filasMedicos = useMemo(
    () => (data?.por_medico || []).filter((f) => verSinActividad || !f.sin_actividad),
    [data, verSinActividad]
  );
  const medicosSinActividad = useMemo(() => (data?.por_medico || []).filter((f) => f.sin_actividad).length, [data]);

  const resumen = data?.resumen;
  const variacion = data?.variacion;
  const proy = data?.proyeccion;
  const totalServicios = (resumen?.servicios || []).reduce((acc, s) => acc + Math.max(0, Number(s.total || 0)), 0);

  return (
    <div className="max-w-7xl mx-auto px-3 sm:px-6 py-6 space-y-6">
      <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-slate-900">Rentabilidad de la Clínica</h1>
          <p className="text-sm text-slate-500">
            Ingresos cobrados, honorarios, gastos y aporte por médico. Solo lectura.
          </p>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          {[
            ['mes', 'Mes actual'],
            ['mes_anterior', 'Mes anterior'],
            ['tres_meses', 'Últimos 3 meses'],
            ['anio', 'Año'],
          ].map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => aplicarPreset(key)}
              className={`px-3 py-1.5 rounded-lg text-sm font-semibold border transition ${
                preset === key ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
              }`}
            >
              {label}
            </button>
          ))}
          <label className="text-xs text-slate-500">
            Desde
            <input
              type="date"
              value={rango.desde}
              max={rango.hasta}
              onChange={(e) => { setPreset(''); setRango((r) => ({ ...r, desde: e.target.value })); }}
              className="block border border-slate-300 rounded-lg px-2 py-1 text-sm text-slate-800"
            />
          </label>
          <label className="text-xs text-slate-500">
            Hasta
            <input
              type="date"
              value={rango.hasta}
              min={rango.desde}
              onChange={(e) => { setPreset(''); setRango((r) => ({ ...r, hasta: e.target.value })); }}
              className="block border border-slate-300 rounded-lg px-2 py-1 text-sm text-slate-800"
            />
          </label>
        </div>
      </div>

      {error && <div className="bg-rose-50 border border-rose-200 text-rose-700 rounded-lg px-4 py-3 text-sm">{error}</div>}
      {loading && !data && <div className="text-slate-500 text-sm">Cargando rentabilidad…</div>}

      {data && resumen && (
        <>
          <div className={`grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 ${loading ? 'opacity-60' : ''}`}>
            <Kpi
              titulo="Ingresos cobrados"
              valor={fmtMoney(resumen.ingresos)}
              pie={<Variacion valor={variacion?.ingresos_pct} />}
            />
            <Kpi
              titulo="Honorarios médicos"
              valor={fmtMoney(resumen.honorarios)}
              acento="text-amber-700"
              pie={(
                <div className="flex flex-col">
                  <span className="text-xs text-slate-500">{fmtPct(resumen.honorarios_pct)} del ingreso</span>
                  <span className="text-xs text-slate-500">
                    Pagado {fmtMoney(resumen.honorarios_pagado)} · Pendiente {fmtMoney(resumen.honorarios_pendiente)}
                  </span>
                  {Number(resumen.honorarios_sobre_cobro_anulado || 0) > 0 && (
                    <span className="text-xs text-rose-600">Incluye {fmtMoney(resumen.honorarios_sobre_cobro_anulado)} sobre cobros anulados</span>
                  )}
                </div>
              )}
            />
            <Kpi
              titulo="Gastos registrados"
              valor={fmtMoney(resumen.gastos)}
              acento="text-slate-700"
              pie={<span className="text-xs text-slate-500">Sin honorarios · puede faltar costo fijo</span>}
            />
            <Kpi
              titulo="Margen de contribución"
              valor={fmtMoney(resumen.contribucion)}
              acento={resumen.contribucion >= 0 ? 'text-emerald-700' : 'text-rose-700'}
              pie={
                <div className="flex flex-col">
                  <span className="text-xs font-semibold text-slate-600">{fmtPct(resumen.margen_pct)} del ingreso</span>
                  <Variacion valor={variacion?.margen_pp} sufijo=" pp" />
                </div>
              }
            />
            <Kpi
              titulo="Ingreso por día activo"
              valor={fmtMoney(resumen.ingreso_por_dia)}
              pie={<span className="text-xs text-slate-500">{resumen.dias_activos} días con cobros</span>}
            />
            <Kpi
              titulo="Aporte por día activo"
              valor={fmtMoney(resumen.contribucion_por_dia)}
              acento="text-emerald-700"
              pie={<span className="text-xs text-slate-500">{resumen.cobros} cobros en el período</span>}
            />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <section className="lg:col-span-2 bg-white rounded-xl border border-slate-200 shadow-sm p-4">
              <h2 className="font-bold text-slate-800 mb-3">Evolución mensual (últimos 12 meses)</h2>
              <ResponsiveContainer width="100%" height={280}>
                <ComposedChart data={serieGrafico} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="etiqueta" tick={{ fontSize: 11 }} />
                  <YAxis yAxisId="monto" tick={{ fontSize: 11 }} />
                  <YAxis yAxisId="pct" orientation="right" tick={{ fontSize: 11 }} unit="%" domain={[0, 100]} />
                  <Tooltip formatter={(v, name) => (name === 'Margen %' ? fmtPct(v) : fmtMoney(v))} />
                  <Legend />
                  <Bar yAxisId="monto" dataKey="ingresos" name="Ingresos" fill="#6366f1" radius={[4, 4, 0, 0]} />
                  <Bar yAxisId="monto" dataKey="contribucion" name="Aporte clínica" fill="#10b981" radius={[4, 4, 0, 0]} />
                  <Line yAxisId="pct" type="monotone" dataKey="margen_pct" name="Margen %" stroke="#f59e0b" strokeWidth={2} dot={{ r: 3 }} />
                </ComposedChart>
              </ResponsiveContainer>
            </section>

            <section className="bg-white rounded-xl border border-slate-200 shadow-sm p-4">
              <h2 className="font-bold text-slate-800 mb-3">Ingreso por servicio</h2>
              {resumen.fuente_servicios !== 'produccion_medica' && (
                <p className="text-[11px] text-amber-700 mb-2">
                  Desglose aproximado: los cobros con varios servicios aparecen como "Paquetes / mixtos".
                </p>
              )}
              <div className="space-y-3">
                {(resumen.servicios || []).length === 0 && <p className="text-sm text-slate-500">Sin cobros en el período.</p>}
                {(resumen.servicios || []).map((s) => {
                  const pct = totalServicios > 0 ? (Math.max(0, s.total) / totalServicios) * 100 : 0;
                  return (
                    <div key={s.servicio}>
                      <div className="flex justify-between text-sm">
                        <span className="text-slate-700">{SERVICIO_LABEL[s.servicio] || s.servicio}</span>
                        <span className="font-semibold text-slate-900">{fmtMoney(s.total)}</span>
                      </div>
                      <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                        <div className="h-full bg-indigo-500" style={{ width: `${Math.min(100, pct)}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>
              {(resumen.gastos_categorias || []).length > 0 && (
                <div className="mt-5 pt-4 border-t border-slate-200">
                  <h3 className="text-sm font-bold text-slate-700 mb-2">Gastos por categoría</h3>
                  <ul className="space-y-1 text-sm">
                    {resumen.gastos_categorias.map((g) => (
                      <li key={`${g.tipo}-${g.categoria}`} className="flex justify-between">
                        <span className="text-slate-600">{g.categoria}</span>
                        <span className="font-semibold text-slate-800">{fmtMoney(g.total)}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </section>
          </div>

          <section className="bg-white rounded-xl border border-slate-200 shadow-sm p-4">
            <div className="flex flex-wrap items-center justify-between gap-2 mb-1">
              <h2 className="font-bold text-slate-800">Aporte de la clínica por médico (acto médico)</h2>
              <span className="text-xs text-slate-500">
                Fuente: {data.atribucion?.fuente === 'produccion_medica' ? 'producción médica (reparto proporcional de lo cobrado)' : 'tarifa de honorarios (estimado)'}
                {data.atribucion?.cobertura_pct !== null && data.atribucion?.cobertura_pct !== undefined ? ` · cobertura ${fmtPct(data.atribucion.cobertura_pct)}` : ''}
              </span>
            </div>
            <p className="text-xs text-slate-500 mb-3">
              Cada médico muestra solo el servicio que él realiza (consulta, ecografía, rayos X, procedimientos, operaciones y paquetes con %).
              El % va para quien realiza el servicio, no para quien lo solicita. Laboratorio y medicamentos son 100% de la clínica.
            </p>
            {medicosSinActividad > 0 && (
              <label className="flex items-center gap-2 text-xs text-slate-600 mb-2">
                <input type="checkbox" checked={verSinActividad} onChange={(e) => setVerSinActividad(e.target.checked)} />
                Mostrar médicos sin actividad en el período ({medicosSinActividad})
              </label>
            )}
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="text-left text-xs uppercase text-slate-500 border-b border-slate-200">
                    <th className="py-2 pr-3">Médico</th>
                    <th className="py-2 pr-3 text-right" title="Cobros con un acto médico realizado por el médico">Atenciones</th>
                    <th className="py-2 pr-3 text-right">Ingresos</th>
                    <th className="py-2 pr-3 text-right">Honorario</th>
                    <th className="py-2 pr-3 text-right">Pagado</th>
                    <th className="py-2 pr-3 text-right">Pendiente</th>
                    <th className="py-2 pr-3 text-right">Aporte clínica</th>
                    <th className="py-2 pr-3 text-right">Margen</th>
                    <th className="py-2 pr-3 text-right">vs anterior</th>
                    <th className="py-2 pr-3 text-right">Aporte / día</th>
                    <th className="py-2 text-right" title="Laboratorio, farmacia y otros que el médico indicó. Son ingreso de la clínica y no suman a su aporte ni a su honorario.">Indicó (no suma)</th>
                  </tr>
                </thead>
                <tbody>
                  {filasMedicos.length === 0 && (
                    <tr><td colSpan={11} className="py-4 text-center text-slate-500">Sin movimientos en el período.</td></tr>
                  )}
                  {filasMedicos.map((f) => (
                    <tr key={f.medico_id} className={`border-b border-slate-100 hover:bg-slate-50 ${f.sin_actividad ? 'text-slate-400' : ''}`}>
                      <td className={`py-2 pr-3 font-medium ${f.sin_actividad ? 'text-slate-400' : 'text-slate-800'}`}>
                        {f.medico}
                        {f.sin_actividad && <span className="ml-2 text-[10px] uppercase rounded bg-slate-100 px-1.5 py-0.5 text-slate-500">Sin actividad</span>}
                      </td>
                      <td className="py-2 pr-3 text-right">{f.atenciones}</td>
                      <td className="py-2 pr-3 text-right">{fmtMoney(f.ingresos)}</td>
                      <td className={`py-2 pr-3 text-right ${f.sin_actividad ? '' : 'text-amber-700'}`}>{fmtMoney(f.honorarios)}</td>
                      <td className="py-2 pr-3 text-right">{fmtMoney(f.honorario_pagado)}</td>
                      <td className="py-2 pr-3 text-right">{fmtMoney(f.honorario_pendiente)}</td>
                      <td className={`py-2 pr-3 text-right font-semibold ${f.sin_actividad ? '' : f.aporte_clinica >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>{fmtMoney(f.aporte_clinica)}</td>
                      <td className="py-2 pr-3 text-right">{fmtPct(f.margen_pct)}</td>
                      <td className="py-2 pr-3 text-right">
                        {f.variacion_pp === null || f.variacion_pp === undefined ? (
                          <span className="text-slate-400">—</span>
                        ) : (
                          <span className={f.variacion_pp >= 0 ? 'text-emerald-600' : 'text-rose-600'}>
                            {f.variacion_pp >= 0 ? '▲' : '▼'} {Math.abs(f.variacion_pp).toFixed(1)} pp
                          </span>
                        )}
                      </td>
                      <td className="py-2 pr-3 text-right">{fmtMoney(f.aporte_por_dia)}</td>
                      <td className="py-2 text-right text-slate-400">{Number(f.indicaciones || 0) > 0 ? fmtMoney(f.indicaciones) : '—'}</td>
                    </tr>
                  ))}
                </tbody>
                {(data.por_medico || []).length > 0 && (
                  <tfoot>
                    <tr className="font-semibold text-slate-900 border-t-2 border-slate-300">
                      <td className="py-2 pr-3">Total acto médico</td>
                      <td />
                      <td className="py-2 pr-3 text-right">{fmtMoney(totalesMedicos.ingresos)}</td>
                      <td className="py-2 pr-3 text-right">{fmtMoney(totalesMedicos.honorarios)}</td>
                      <td className="py-2 pr-3 text-right">{fmtMoney(totalesMedicos.pagado)}</td>
                      <td className="py-2 pr-3 text-right">{fmtMoney(totalesMedicos.pendiente)}</td>
                      <td className="py-2 pr-3 text-right">{fmtMoney(totalesMedicos.aporte)}</td>
                      <td className="py-2 pr-3 text-right">{fmtPct(totalesMedicos.ingresos > 0 ? (totalesMedicos.aporte / totalesMedicos.ingresos) * 100 : null)}</td>
                      <td colSpan={2} />
                      <td className="py-2 text-right text-slate-400">{totalesMedicos.indicaciones > 0 ? fmtMoney(totalesMedicos.indicaciones) : '—'}</td>
                    </tr>
                    <tr className="text-slate-800">
                      <td className="py-2 pr-3">Ingresos propios de la clínica</td>
                      <td />
                      <td className="py-2 pr-3 text-right">{fmtMoney(totalClinica.propios)}</td>
                      <td className="py-2 pr-3 text-right">{fmtMoney(0)}</td>
                      <td colSpan={2} />
                      <td className="py-2 pr-3 text-right font-semibold text-emerald-700">{fmtMoney(totalClinica.propios)}</td>
                      <td className="py-2 pr-3 text-right">{totalClinica.propios > 0 ? '100.0%' : '—'}</td>
                      <td colSpan={3} />
                    </tr>
                    {totalClinica.anulados > 0 && (
                      <tr className="text-rose-700">
                        <td className="py-2 pr-3">Honorarios sobre cobros anulados (costo absorbido)</td>
                        <td colSpan={2} />
                        <td className="py-2 pr-3 text-right">{fmtMoney(totalClinica.anulados)}</td>
                        <td colSpan={2} />
                        <td className="py-2 pr-3 text-right font-semibold">{fmtMoney(-totalClinica.anulados)}</td>
                        <td colSpan={4} />
                      </tr>
                    )}
                    {totalClinica.sinMedico > 0 && (
                      <tr className="text-amber-700">
                        <td className="py-2 pr-3">Honorarios sin médico asignado</td>
                        <td colSpan={2} />
                        <td className="py-2 pr-3 text-right">{fmtMoney(totalClinica.sinMedico)}</td>
                        <td colSpan={2} />
                        <td className="py-2 pr-3 text-right font-semibold">{fmtMoney(-totalClinica.sinMedico)}</td>
                        <td colSpan={4} />
                      </tr>
                    )}
                    <tr className="font-bold text-slate-900 border-t-2 border-slate-300">
                      <td className="py-2 pr-3">Total clínica</td>
                      <td />
                      <td className="py-2 pr-3 text-right">{fmtMoney(totalClinica.ingresos)}</td>
                      <td className="py-2 pr-3 text-right">{fmtMoney(totalClinica.honorarios)}</td>
                      <td className="py-2 pr-3 text-right">{fmtMoney(totalClinica.pagado)}</td>
                      <td className="py-2 pr-3 text-right">{fmtMoney(totalClinica.pendiente)}</td>
                      <td className="py-2 pr-3 text-right">{fmtMoney(totalClinica.aporte)}</td>
                      <td className="py-2 pr-3 text-right">{fmtPct(totalClinica.ingresos > 0 ? (totalClinica.aporte / totalClinica.ingresos) * 100 : null)}</td>
                      <td colSpan={3} />
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
            <p className="text-xs text-slate-500 mt-3">
              Honorario = devengado (pagado + pendiente), igual que en{' '}
              <Link to="/contabilidad/liquidacion-honorarios" className="text-indigo-600 underline">Honorarios Médicos</Link>.
              {data.honorarios_detalle && Math.abs(Number(data.honorarios_detalle.diferencia || 0)) < 0.01
                ? ' La tabla cuadra con el total de honorarios del período.'
                : ` Diferencia sin explicar frente al total de honorarios: ${fmtMoney(data.honorarios_detalle?.diferencia)}.`}
            </p>
          </section>

          {data.ingresos_propios && (
            <section className="bg-white rounded-xl border border-slate-200 shadow-sm p-4">
              <div className="flex flex-wrap items-center justify-between gap-2 mb-1">
                <h2 className="font-bold text-slate-800">Ingresos propios de la clínica</h2>
                <span className="text-sm font-bold text-emerald-700">{fmtMoney(data.ingresos_propios.total)}</span>
              </div>
              <p className="text-xs text-slate-500 mb-3">
                Laboratorio, farmacia y todo lo que no es un acto médico con %. Pertenece 100% a la clínica aunque lo haya indicado un médico:
                {' '}{fmtMoney(data.ingresos_propios.indicadas_por_medicos)} indicados por médicos y {fmtMoney(data.ingresos_propios.sin_medico)} sin médico asignado.
              </p>
              <ul className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-1 text-sm">
                {(data.ingresos_propios.servicios || []).map((s) => (
                  <li key={s.servicio} className="flex justify-between gap-3 border-b border-slate-100 py-1">
                    <span className="text-slate-700">
                      {SERVICIO_LABEL[s.servicio] || s.servicio}
                      {s.es_acto && <span className="ml-2 text-[10px] uppercase rounded bg-amber-100 px-1.5 py-0.5 text-amber-700">Sin médico asignado</span>}
                      {Number(s.indicadas_por_medicos || 0) > 0 && (
                        <span className="ml-2 text-xs text-slate-400">({fmtMoney(s.indicadas_por_medicos)} indicados por médicos)</span>
                      )}
                    </span>
                    <span className="font-semibold text-slate-900">{fmtMoney(s.total)}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section className="bg-white rounded-xl border border-slate-200 shadow-sm p-4">
            <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
              <h2 className="font-bold text-slate-800">Proyecciones</h2>
              <div className="flex items-center gap-2">
                <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${CONFIANZA_ESTILO[proy?.confianza] || CONFIANZA_ESTILO.baja}`}>
                  Confianza {proy?.confianza || 'baja'} · {proy?.meses_con_historia ?? 0} mes(es) de historia
                </span>
                <button type="button" onClick={() => setVerSupuestos((v) => !v)} className="text-xs text-indigo-600 underline">
                  {verSupuestos ? 'Ocultar supuestos' : 'Ver supuestos'}
                </button>
              </div>
            </div>
            {!proy?.disponible ? (
              <p className="text-sm text-slate-500">{proy?.motivo || 'Aún no hay datos suficientes para proyectar.'}</p>
            ) : (
              <>
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
                  {[
                    ['mes_en_curso', `Cierre de ${etiquetaMes(proy.mes_en_curso)}`],
                    ['proximo_mes', 'Próximo mes'],
                    ['proximo_trimestre', 'Próximo trimestre'],
                    ['proximos_12_meses', 'Próximos 12 meses'],
                  ].map(([clave, titulo]) => (
                    <div key={clave} className="border border-slate-200 rounded-xl p-3 space-y-2">
                      <h3 className="text-sm font-bold text-slate-700">{titulo}</h3>
                      <Escenario nombre="Conservador" datos={proy.escenarios?.conservador?.[clave]} />
                      <Escenario nombre="Base" datos={proy.escenarios?.base?.[clave]} destacado />
                      <Escenario nombre="Optimista" datos={proy.escenarios?.optimista?.[clave]} />
                    </div>
                  ))}
                </div>
                {verSupuestos && (
                  <ul className="mt-4 list-disc ml-5 text-xs text-slate-600 space-y-1">
                    <li>Ritmo por día activo: conservador {fmtMoney(proy.tasas_por_dia?.conservador)}, base {fmtMoney(proy.tasas_por_dia?.base)}, optimista {fmtMoney(proy.tasas_por_dia?.optimista)}.</li>
                    <li>Días activos esperados por mes: {proy.dias_activos_esperados_mes}. Honorarios supuestos: {fmtPct(proy.honorarios_pct_supuesto)} del ingreso. Gasto mensual supuesto: {fmtMoney(proy.gasto_mensual_supuesto)}.</li>
                    {(proy.supuestos || []).map((s) => <li key={s}>{s}</li>)}
                  </ul>
                )}
              </>
            )}
          </section>

          <section className="bg-white rounded-xl border border-slate-200 shadow-sm p-4">
            <h2 className="font-bold text-slate-800 mb-3">Alertas y calidad de datos</h2>
            {(data.alertas || []).length === 0 && <p className="text-sm text-emerald-700">Sin alertas en el período.</p>}
            <div className="space-y-3">
              {(data.alertas || []).map((a) => (
                <div key={a.codigo} className={`border rounded-lg px-4 py-3 ${NIVEL_ESTILO[a.nivel] || NIVEL_ESTILO.info}`}>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-semibold">{a.titulo}</span>
                    <span className="text-sm font-bold">
                      {a.cantidad !== null && a.cantidad !== undefined ? `${a.cantidad} caso(s)` : ''}
                      {a.monto !== null && a.monto !== undefined ? ` · ${fmtMoney(a.monto)}` : ''}
                    </span>
                  </div>
                  <p className="text-sm mt-1">{a.mensaje}</p>
                  {a.codigo === 'honorarios_sobre_cobro_no_pagado' && Array.isArray(a.detalle) && (
                    <div className="overflow-x-auto mt-2">
                      <table className="min-w-full text-xs bg-white/60 rounded">
                        <thead>
                          <tr className="text-left"><th className="p-1">Fecha</th><th className="p-1">Médico</th><th className="p-1">Servicio</th><th className="p-1 text-right">Honorario</th><th className="p-1">Cobro</th></tr>
                        </thead>
                        <tbody>
                          {a.detalle.map((d) => (
                            <tr key={d.id} className="border-t border-rose-100">
                              <td className="p-1">{d.fecha}</td>
                              <td className="p-1">{d.medico}</td>
                              <td className="p-1">{d.tipo_servicio}</td>
                              <td className="p-1 text-right">{fmtMoney(d.monto_medico)}</td>
                              <td className="p-1">#{d.cobro_id} ({d.cobro_estado})</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                  {(a.codigo === 'acto_sin_honorario') && Array.isArray(a.detalle) && (
                    <div className="overflow-x-auto mt-2">
                      <table className="min-w-full text-xs bg-white/60 rounded">
                        <thead>
                          <tr className="text-left"><th className="p-1">Médico</th><th className="p-1">Servicio</th><th className="p-1 text-right">Cobros</th><th className="p-1 text-right">Monto</th></tr>
                        </thead>
                        <tbody>
                          {a.detalle.map((d) => (
                            <tr key={`${d.medico}-${d.servicio}`} className="border-t border-amber-100">
                              <td className="p-1">{d.medico}</td>
                              <td className="p-1">{SERVICIO_LABEL[d.servicio] || d.servicio}</td>
                              <td className="p-1 text-right">{d.cobros}</td>
                              <td className="p-1 text-right">{fmtMoney(d.monto)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                  {a.codigo === 'acto_sin_medico' && Array.isArray(a.detalle) && (
                    <ul className="mt-2 text-sm list-disc ml-5">
                      {a.detalle.map((d) => (
                        <li key={d.servicio}>{SERVICIO_LABEL[d.servicio] || d.servicio}: {fmtMoney(d.total)}</li>
                      ))}
                    </ul>
                  )}
                  {a.codigo === 'margen_en_caida' && Array.isArray(a.detalle) && (
                    <ul className="mt-2 text-sm list-disc ml-5">
                      {a.detalle.map((d) => (
                        <li key={d.medico}>{d.medico}: {fmtPct(d.margen_anterior_pct)} → {fmtPct(d.margen_pct)}</li>
                      ))}
                    </ul>
                  )}
                </div>
              ))}
            </div>
            {data.cancelados_periodo?.cantidad > 0 && (
              <p className="text-xs text-slate-500 mt-3">
                {data.cancelados_periodo.cantidad} honorarios cancelados ({fmtMoney(data.cancelados_periodo.monto)}) no se cuentan en este reporte.
              </p>
            )}
          </section>

          <p className="text-xs text-slate-500">
            Margen de contribución = ingresos cobrados − honorarios médicos − gastos registrados. No es utilidad neta: no incluye costos fijos no registrados ni inversiones.
          </p>
        </>
      )}
    </div>
  );
}

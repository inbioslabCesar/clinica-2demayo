import React, { useEffect, useMemo, useState } from "react";
import * as XLSX from "xlsx";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { BASE_URL } from "../config/config";

export default function AuditoriaEliminacionesPage() {
  const hoy = useMemo(() => {
    const now = new Date();
    const local = new Date(now.getTime() - now.getTimezoneOffset() * 60000);
    return local.toISOString().slice(0, 10);
  }, []);
  const [desde, setDesde] = useState(hoy);
  const [hasta, setHasta] = useState(hoy);
  const [servicioTipo, setServicioTipo] = useState("");
  const [usuarioId, setUsuarioId] = useState("");
  const [cobroId, setCobroId] = useState("");
  const [paciente, setPaciente] = useState("");
  const [montoMin, setMontoMin] = useState("");
  const [montoMax, setMontoMax] = useState("");
  const [cargando, setCargando] = useState(false);
  const [logs, setLogs] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(3);
  const [usuarios, setUsuarios] = useState([]);
  const [detalle, setDetalle] = useState(null);

  // Descargar todos los resultados del filtro, paginando en el backend
  const fetchAllFiltered = React.useCallback(async () => {
    const buildParams = () => {
      const params = new URLSearchParams();
      if (desde) params.set('desde', desde);
      if (hasta) params.set('hasta', hasta);
      if (servicioTipo) params.set('servicio_tipo', servicioTipo);
      if (usuarioId) params.set('usuario_id', usuarioId);
      if (cobroId) params.set('cobro_id', cobroId);
      if (paciente) params.set('paciente', paciente);
      if (montoMin !== '') params.set('monto_min', montoMin);
      if (montoMax !== '') params.set('monto_max', montoMax);
      return params;
    };

    // Para exportación usamos el mayor límite permitido (10)
    const limit = 10;
    let pageExp = 1;
    let totalExp = 0;
    let collected = [];

    // Primera llamada para conocer el total
    {
      const params = buildParams();
      params.set('limit', String(limit));
      params.set('page', String(pageExp));
      const resp = await fetch(`${BASE_URL}api_log_eliminaciones.php?${params.toString()}`, { credentials: 'include' });
      const data = await resp.json();
      if (!data.success) return [];
      totalExp = data.total || 0;
      collected = (data.logs || []).slice();
    }

    // Si aún faltan páginas, seguir trayendo
    const totalPages = Math.max(1, Math.ceil(totalExp / limit));
    while (pageExp < totalPages) {
      pageExp += 1;
      const params = buildParams();
      params.set('limit', String(limit));
      params.set('page', String(pageExp));
      const resp = await fetch(`${BASE_URL}api_log_eliminaciones.php?${params.toString()}`, { credentials: 'include' });
      const data = await resp.json();
      if (!data.success) break;
      if (Array.isArray(data.logs)) collected = collected.concat(data.logs);
    }
    return collected;
  }, [BASE_URL, desde, hasta, servicioTipo, usuarioId, cobroId, paciente, montoMin, montoMax]);

  const cargar = React.useCallback(async () => {
    setCargando(true);
    try {
      const params = new URLSearchParams();
      if (desde) params.set('desde', desde);
      if (hasta) params.set('hasta', hasta);
      if (servicioTipo) params.set('servicio_tipo', servicioTipo);
      if (usuarioId) params.set('usuario_id', usuarioId);
      if (cobroId) params.set('cobro_id', cobroId);
      if (paciente) params.set('paciente', paciente);
      if (montoMin !== '') params.set('monto_min', montoMin);
      if (montoMax !== '') params.set('monto_max', montoMax);
      params.set('limit', String(pageSize));
      params.set('page', String(page));
      const resp = await fetch(`${BASE_URL}api_log_eliminaciones.php?${params.toString()}`, { credentials: 'include' });
      const data = await resp.json();
      if (data.success) {
        setLogs(data.logs || []);
        setTotal(data.total || 0);
      }
    } catch {
      // noop
    } finally {
      setCargando(false);
    }
  }, [desde, hasta, servicioTipo, usuarioId, cobroId, paciente, montoMin, montoMax, page, pageSize]);

  useEffect(() => { cargar(); }, [cargar]);

  useEffect(() => {
    (async () => {
      try {
        const resp = await fetch(`${BASE_URL}api_usuarios.php`, { credentials: 'include' });
        const data = await resp.json();
        if (Array.isArray(data)) {
          setUsuarios(data);
        }
      } catch {
        // noop
      }
    })();
  }, []);

  const exportExcel = async () => {
    const fullLogs = await fetchAllFiltered();
    const rows = fullLogs.map(r => {
      const desc = r.item?.descripcion || r.item?.nombre || JSON.stringify(r.item || {});
      const pacienteStr = r.paciente_nombre ? `${r.paciente_nombre}${r.paciente_dni ? ` (${r.paciente_dni})` : ''}` : (r.paciente_id || '-');
      return {
        'Fecha/Hora': new Date(r.fecha_hora.replace(' ','T')).toLocaleString(),
        'Cobro': `#${r.cobro_id}`,
        'Servicio': r.servicio_tipo,
        'Descripción': desc,
        'Monto': Number(r.monto),
        'Motivo': r.motivo || '',
        'Usuario': r.usuario_nombre || r.usuario_id || '',
        'Paciente': pacienteStr,
        'Caja': r.caja_id || ''
      };
    });
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Auditoria');
    XLSX.writeFile(wb, `auditoria_eliminaciones_${desde}_a_${hasta}.xlsx`);
  };

  const exportPDF = async () => {
    const fullLogs = await fetchAllFiltered();
    const doc = new jsPDF({ orientation: 'landscape' });
    const title = `Auditoría de Eliminaciones ${desde} a ${hasta}`;
    doc.setFontSize(14);
    doc.text(title, 14, 16);
    const head = [[
      'Fecha/Hora','Cobro','Servicio','Descripción','Monto','Motivo','Usuario','Paciente','Caja'
    ]];
    const body = fullLogs.map(r => {
      const descRaw = r.item?.descripcion || r.item?.nombre || JSON.stringify(r.item || {});
      const desc = String(descRaw);
      const pacienteStr = r.paciente_nombre ? `${r.paciente_nombre}${r.paciente_dni ? ` (${r.paciente_dni})` : ''}` : (r.paciente_id || '-');
      return [
        new Date(r.fecha_hora.replace(' ','T')).toLocaleString(),
        `#${r.cobro_id}`,
        r.servicio_tipo,
        desc,
        `S/ ${Number(r.monto).toFixed(2)}`,
        r.motivo || '-',
        r.usuario_nombre || r.usuario_id || '-',
        pacienteStr,
        r.caja_id || '-'
      ];
    });
    autoTable(doc, {
      head,
      body,
      styles: { fontSize: 8, cellPadding: 2 },
      headStyles: { fillColor: [231, 229, 228], textColor: 20 },
      columnStyles: { 4: { halign: 'right' } },
      startY: 20,
      margin: { left: 10, right: 10 },
      tableWidth: 'auto'
    });
    doc.save(`auditoria_eliminaciones_${desde}_a_${hasta}.pdf`);
  };

  return (
    <div className="max-w-[1400px] mx-auto p-6">
      <h1 className="text-3xl font-bold text-rose-700 mb-4 text-center">Auditoría de Eliminaciones</h1>
      <div className="bg-white rounded-xl shadow p-4 mb-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
          <div>
            <label className="block text-sm text-gray-600 mb-1">Desde</label>
            <input type="date" value={desde} onChange={e=>setDesde(e.target.value)} className="w-full border rounded px-2 py-1" />
          </div>
          <div>
            <label className="block text-sm text-gray-600 mb-1">Hasta</label>
            <input type="date" value={hasta} onChange={e=>setHasta(e.target.value)} className="w-full border rounded px-2 py-1" />
          </div>
          <div>
            <label className="block text-sm text-gray-600 mb-1">Servicio</label>
            <select value={servicioTipo} onChange={e=>setServicioTipo(e.target.value)} className="w-full border rounded px-2 py-1">
              <option value="">Todos</option>
              <option value="farmacia">Farmacia</option>
              <option value="laboratorio">Laboratorio</option>
              <option value="consulta">Consulta</option>
              <option value="ecografia">Ecografía</option>
              <option value="rayosx">Rayos X</option>
              <option value="procedimiento">Procedimiento</option>
              <option value="operaciones">Operaciones</option>
            </select>
          </div>
          <div>
            <label className="block text-sm text-gray-600 mb-1">Paciente (nombre/DNI)</label>
            <input type="text" value={paciente} onChange={e=>setPaciente(e.target.value)} className="w-full border rounded px-2 py-1" placeholder="Ej. Pérez 44556677" />
          </div>
          <div>
            <label className="block text-sm text-gray-600 mb-1">Usuario</label>
            <select value={usuarioId} onChange={e=>setUsuarioId(e.target.value)} className="w-full border rounded px-2 py-1">
              <option value="">Todos</option>
              {usuarios.map(u => (
                <option key={u.id} value={u.id}>{u.nombre} ({u.usuario})</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm text-gray-600 mb-1">Cobro ID</label>
            <input type="number" min="1" value={cobroId} onChange={e=>setCobroId(e.target.value)} className="w-full border rounded px-2 py-1" />
          </div>
          <div>
            <label className="block text-sm text-gray-600 mb-1">Monto mínimo</label>
            <input type="number" min="0" step="0.01" value={montoMin} onChange={e=>setMontoMin(e.target.value)} className="w-full border rounded px-2 py-1" />
          </div>
          <div>
            <label className="block text-sm text-gray-600 mb-1">Monto máximo</label>
            <input type="number" min="0" step="0.01" value={montoMax} onChange={e=>setMontoMax(e.target.value)} className="w-full border rounded px-2 py-1" />
          </div>
          <div className="flex items-end gap-2">
            <button onClick={() => setPage(1)} className="w-full bg-rose-600 hover:bg-rose-700 text-white font-semibold px-4 py-2 rounded shadow">Filtrar</button>
            <button onClick={exportExcel} className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-semibold px-4 py-2 rounded shadow">Exportar Excel</button>
            <button onClick={exportPDF} className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold px-4 py-2 rounded shadow">Exportar PDF</button>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="bg-gray-100 text-gray-700">
              <th className="px-3 py-2 text-left">Fecha/Hora</th>
              <th className="px-3 py-2 text-left">Cobro</th>
              <th className="px-3 py-2 text-left">Servicio</th>
              <th className="px-3 py-2 text-left">Descripción</th>
              <th className="px-3 py-2 text-right">Monto</th>
              <th className="px-3 py-2 text-left">Motivo</th>
              <th className="px-3 py-2 text-left">Usuario</th>
              <th className="px-3 py-2 text-left">Paciente</th>
              <th className="px-3 py-2 text-left">Caja</th>
              <th className="px-3 py-2 text-left">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {cargando ? (
              <tr><td className="px-3 py-4" colSpan={10}>Cargando...</td></tr>
            ) : logs.length === 0 ? (
              <tr><td className="px-3 py-4" colSpan={10}>Sin resultados</td></tr>
            ) : (
              logs.map((r) => {
                const desc = r.item?.descripcion || r.item?.nombre || JSON.stringify(r.item);
                return (
                  <tr key={r.id} className="border-t">
                    <td className="px-3 py-2">{new Date(r.fecha_hora.replace(' ','T')).toLocaleString()}</td>
                    <td className="px-3 py-2">#{r.cobro_id}</td>
                    <td className="px-3 py-2 capitalize">{r.servicio_tipo}</td>
                    <td className="px-3 py-2">{desc}</td>
                    <td className="px-3 py-2 text-right">S/ {Number(r.monto).toFixed(2)}</td>
                    <td className="px-3 py-2">{r.motivo || '-'}</td>
                    <td className="px-3 py-2">{r.usuario_nombre || r.usuario_id || '-'}</td>
                    <td className="px-3 py-2">{r.paciente_nombre ? `${r.paciente_nombre}${r.paciente_dni ? ` (${r.paciente_dni})` : ''}` : (r.paciente_id || '-')}</td>
                    <td className="px-3 py-2">{r.caja_id || '-'}</td>
                    <td className="px-3 py-2">
                      <button onClick={() => setDetalle(r)} className="text-rose-700 hover:text-rose-900 font-semibold text-sm">Ver detalle</button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Paginación */}
      <div className="bg-white rounded-xl shadow mt-3 p-3 flex flex-col sm:flex-row items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="text-sm text-gray-600">Por página:</span>
          <select
            className="border rounded px-2 py-1"
            value={pageSize}
            onChange={(e)=>{ setPageSize(Number(e.target.value)); setPage(1); }}
          >
            <option value={3}>3</option>
            <option value={5}>5</option>
            <option value={10}>10</option>
          </select>
        </div>
        <div className="text-sm text-gray-600">
          {total > 0 ? `${Math.min((page-1)*pageSize+1, total)}–${Math.min(page*pageSize, total)} de ${total}` : '0 resultados'}
        </div>
        <div className="flex items-center gap-2">
          <button
            className="px-3 py-1 border rounded disabled:opacity-50"
            onClick={()=> setPage(p => Math.max(1, p-1))}
            disabled={page <= 1}
          >
            Anterior
          </button>
          <span className="text-sm text-gray-700">Página {page} / {Math.max(1, Math.ceil(total / pageSize))}</span>
          <button
            className="px-3 py-1 border rounded disabled:opacity-50"
            onClick={()=> setPage(p => Math.min(Math.max(1, Math.ceil(total / pageSize)), p+1))}
            disabled={page >= Math.max(1, Math.ceil(total / pageSize))}
          >
            Siguiente
          </button>
        </div>
      </div>

      {detalle && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-lg max-w-3xl w-full p-4 relative">
            <button className="absolute right-3 top-2 text-gray-500 hover:text-red-600 text-xl font-bold" onClick={()=>setDetalle(null)}>×</button>
            <h3 className="text-lg font-bold text-rose-700 mb-2">Detalle de Eliminación</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm mb-3">
              <div><span className="font-semibold">Fecha:</span> {new Date(detalle.fecha_hora.replace(' ','T')).toLocaleString()}</div>
              <div><span className="font-semibold">Cobro:</span> #{detalle.cobro_id}</div>
              <div><span className="font-semibold">Servicio:</span> {detalle.servicio_tipo}</div>
              <div><span className="font-semibold">Monto:</span> S/ {Number(detalle.monto).toFixed(2)}</div>
              <div><span className="font-semibold">Usuario:</span> {detalle.usuario_nombre ? `${detalle.usuario_nombre} (${detalle.usuario_id})` : (detalle.usuario_id || '-')}</div>
              <div><span className="font-semibold">Paciente:</span> {detalle.paciente_nombre || detalle.paciente_id} {detalle.paciente_dni ? `(${detalle.paciente_dni})` : ''}</div>
              <div><span className="font-semibold">Caja ID:</span> {detalle.caja_id || '-'}</div>
              <div className="md:col-span-2"><span className="font-semibold">Motivo:</span> {detalle.motivo || '-'}</div>
            </div>
            <pre className="bg-gray-100 rounded p-3 overflow-auto text-xs max-h-80">{JSON.stringify(detalle.item, null, 2)}</pre>
            <div className="mt-3 text-right">
              <button className="bg-rose-600 hover:bg-rose-700 text-white font-semibold px-4 py-2 rounded" onClick={()=>setDetalle(null)}>Cerrar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

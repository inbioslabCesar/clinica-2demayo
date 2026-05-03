
import { useEffect, useRef, useState } from "react";
// Lazy loading de librerías pesadas para exportar
import { authFetch } from "../utils/apiClient";

export default function FarmaciaVentasPage() {
  const REQUEST_TIMEOUT_MS = 12000;
  const [ventas, setVentas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [detalleVenta, setDetalleVenta] = useState(null);
  const [detalles, setDetalles] = useState([]);
  const [detalleLoading, setDetalleLoading] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [fechaInicio, setFechaInicio] = useState("");
  const [fechaFin, setFechaFin] = useState("");
  const [pagina, setPagina] = useState(1);
  const [tamanoPagina, setTamanoPagina] = useState(3);
  const [totalVentas, setTotalVentas] = useState(0);
  const [buscarInput, setBuscarInput] = useState("");
  const [buscar, setBuscar] = useState("");
  const debounceRef = useRef(null);
  const ventasRequestIdRef = useRef(0);
  const ventasAbortRef = useRef(null);
  const detalleAbortRef = useRef(null);

  const handleBuscarChange = (e) => {
    const val = e.target.value;
    setBuscarInput(val);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setBuscar(val);
      setPagina(1);
    }, 350);
  };

  const limpiarBusqueda = () => {
    setBuscarInput("");
    setBuscar("");
    setPagina(1);
  };

  const cargarVentas = async () => {
    const requestId = ++ventasRequestIdRef.current;
    if (ventasAbortRef.current) {
      ventasAbortRef.current.abort();
    }
    const controller = new AbortController();
    ventasAbortRef.current = controller;
    const timeoutId = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    setLoading(true);
    let url = `api_cotizaciones_farmacia.php`;
    const params = [`page=${pagina}`, `limit=${tamanoPagina}`];
    let inicio = fechaInicio;
    let fin = fechaFin;
    if ((inicio && !fin) || (!inicio && fin)) {
      inicio = inicio || fin;
      fin = fin || inicio;
    }
    if (inicio && fin) {
      params.push(`fecha_inicio=${inicio}`);
      params.push(`fecha_fin=${fin}`);
    }
    if (buscar.trim()) {
      params.push(`buscar=${encodeURIComponent(buscar.trim())}`);
    }
    url += "?" + params.join("&");
    try {
      const res = await authFetch(url, {
        cache: "no-store",
        signal: controller.signal,
      });
      if (!res.ok) {
        throw new Error(`Error HTTP: ${res.status}`);
      }
      const data = await res.json();
      if (requestId !== ventasRequestIdRef.current) return;
      setVentas(data.cotizaciones || []);
      setTotalVentas(data.total || 0);
    } catch {
      if (requestId !== ventasRequestIdRef.current) return;
      setVentas([]);
      setTotalVentas(0);
      // Eliminado log y alert de error al cargar ventas
    } finally {
      window.clearTimeout(timeoutId);
      if (requestId === ventasRequestIdRef.current) {
        setLoading(false);
      }
    }
  };

  useEffect(() => {
    cargarVentas();
    return () => {
      if (ventasAbortRef.current) {
        ventasAbortRef.current.abort();
      }
    };
    // eslint-disable-next-line
  }, [fechaInicio, fechaFin, pagina, tamanoPagina, buscar]);

  const verDetalle = async (venta) => {
    if (detalleAbortRef.current) {
      detalleAbortRef.current.abort();
    }
    const controller = new AbortController();
    detalleAbortRef.current = controller;
    const timeoutId = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    setDetalleVenta(venta);
    setDetalles([]);
    setDetalleLoading(true);
    setModalOpen(true);
    try {
      const res = await authFetch(
        `api_cotizaciones_farmacia.php?cotizacion_id=${venta.id}&source=${venta.source || "legacy"}`,
        {
          cache: "no-store",
          signal: controller.signal,
        }
      );
      const data = await res.json();
      setDetalles(data.cotizacion?.detalles || []);
    } catch {
      setDetalles([]);
    } finally {
      window.clearTimeout(timeoutId);
      setDetalleLoading(false);
    }
  };

  // Exportar a PDF con lazy loading
  const exportarPDF = async () => {
    const jsPDF = (await import('jspdf')).default;
    const autoTable = (await import('jspdf-autotable')).default;
    const doc = new jsPDF();
    doc.text("Ventas de Farmacia", 14, 14);
    autoTable(doc, {
      head: [["Fecha", "Referencia", "Paciente", "DNI", "Médico", "Vendido por", "Total", "Estado"]],
      body: ventas.map(v => [v.fecha, v.referencia || "-", v.paciente_nombre || "-", v.paciente_dni || "-", v.medico_nombre || "Venta directa", v.usuario_nombre || v.usuario_id, v.total, v.estado]),
    });
    doc.save("ventas_farmacia.pdf");
  };

  // Exportar a Excel con lazy loading
  const exportarExcel = async () => {
    const XLSX = await import('xlsx');
    const ws = XLSX.utils.json_to_sheet(ventas.map(v => ({
      Fecha: v.fecha,
      Referencia: v.referencia || "-",
      Paciente: v.paciente_nombre || "-",
      DNI: v.paciente_dni || "-",
      "Médico": v.medico_nombre || "Venta directa",
      "Vendido por": v.usuario_nombre || v.usuario_id,
      Total: v.total,
      Estado: v.estado
    })));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Ventas");
    XLSX.writeFile(wb, "ventas_farmacia.xlsx");
  };

  return (
    <div className="max-w-5xl mx-auto p-6 bg-white rounded-xl shadow-lg mt-8">
      <h2 className="text-2xl font-bold mb-4" style={{ color: "var(--color-secondary)" }}>Ventas de Farmacia</h2>
      <div className="flex flex-wrap gap-4 mb-4 items-center">
        <label className="text-sm">Mostrar:
          <select value={tamanoPagina} onChange={e => { setTamanoPagina(Number(e.target.value)); setPagina(1); }} className="ml-2 border rounded px-2 py-1">
            <option value={3}>3</option>
            <option value={5}>5</option>
            <option value={10}>10</option>
            <option value={25}>25</option>
          </select>
        </label>
        <button className="px-3 py-1 bg-green-600 text-white rounded" onClick={exportarPDF}>Exportar PDF</button>
        <button className="px-3 py-1 bg-amber-500 text-white rounded" onClick={exportarExcel}>Exportar Excel</button>
        <label className="text-sm">Desde:
          <input type="date" value={fechaInicio} onChange={e => setFechaInicio(e.target.value)} className="ml-2 border rounded px-2 py-1" />
        </label>
        <label className="text-sm">Hasta:
          <input type="date" value={fechaFin} onChange={e => setFechaFin(e.target.value)} className="ml-2 border rounded px-2 py-1" />
        </label>
        <button className="px-3 py-1 text-white rounded" onClick={cargarVentas} style={{ background: "linear-gradient(90deg, var(--color-primary), var(--color-secondary))" }}>Filtrar</button>
        {(fechaInicio || fechaFin) && (
          <button className="px-2 py-1 bg-gray-200 text-gray-700 rounded" onClick={() => { setFechaInicio(""); setFechaFin(""); }}>Limpiar</button>
        )}
      </div>
      {/* Buscador dinámico */}
      <div className="flex items-center gap-2 mb-4">
        <div className="relative flex-1 max-w-md">
          <span className="absolute inset-y-0 left-3 flex items-center text-gray-400 pointer-events-none">
            <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-4.35-4.35m0 0A7 7 0 1 0 6.5 6.5a7 7 0 0 0 9.15 9.15z" /></svg>
          </span>
          <input
            type="text"
            value={buscarInput}
            onChange={handleBuscarChange}
            placeholder="Buscar por paciente, DNI, referencia, médico…"
            className="w-full pl-9 pr-9 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-green-500"
          />
          {buscarInput && (
            <button
              onClick={limpiarBusqueda}
              className="absolute inset-y-0 right-2 flex items-center text-gray-400 hover:text-gray-600"
              title="Limpiar búsqueda"
            >✕</button>
          )}
        </div>
        {buscar && (
          <span className="text-xs text-gray-500 whitespace-nowrap">
            {totalVentas} resultado{totalVentas !== 1 ? 's' : ''}
          </span>
        )}
      </div>
      {loading ? (
        <div className="text-center text-gray-500 py-8">Cargando ventas...</div>
      ) : ventas.length === 0 ? (
        <div className="text-center text-gray-500 py-8">No hay ventas registradas.</div>
      ) : (
        <>
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-sm border min-w-[820px]">
              <thead>
                <tr style={{ background: "var(--color-primary-light)" }}>
                  <th className="p-2">Fecha</th>
                  <th className="p-2">Referencia</th>
                  <th className="p-2">Paciente</th>
                  <th className="p-2">DNI</th>
                  <th className="p-2">Médico</th>
                  <th className="p-2">Vendido por</th>
                  <th className="p-2">Total</th>
                  <th className="p-2">Estado</th>
                  <th className="p-2">Detalle</th>
                </tr>
              </thead>
              <tbody>
                {ventas.map(v => (
                  <tr key={`${v.source}-${v.id}`} className="border-b">
                    <td className="p-2">{v.fecha}</td>
                    <td className="p-2 font-medium">{v.referencia || "-"}</td>
                    <td className="p-2">{v.paciente_nombre || "-"}</td>
                    <td className="p-2">{v.paciente_dni || "-"}</td>
                    <td className="p-2">{v.medico_nombre || "Venta directa"}</td>
                    <td className="p-2">{v.usuario_nombre || v.usuario_id}</td>
                    <td className="p-2 font-bold" style={{ color: "var(--color-secondary)" }}>S/ {v.total}</td>
                    <td className="p-2 capitalize">{v.estado}</td>
                    <td className="p-2">
                      <button className="px-2 py-1 rounded" style={{ background: "var(--color-primary-light)", color: "var(--color-secondary)" }} onClick={() => verDetalle(v)}>Ver</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="grid gap-3 md:hidden">
            {ventas.map(v => (
              <div key={`${v.source}-${v.id}`} className="border rounded-lg p-4 shadow-sm">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="font-semibold text-sm">{v.paciente_nombre || "-"}</div>
                    <div className="text-xs text-gray-500">{v.fecha}</div>
                  </div>
                  <div className="text-right">
                    <div className="text-sm font-bold" style={{ color: "var(--color-secondary)" }}>S/ {v.total}</div>
                    <div className="text-xs text-gray-500">{v.referencia || "-"}</div>
                  </div>
                </div>
                <div className="mt-3 space-y-1 text-sm text-gray-700">
                  <div><b>DNI:</b> {v.paciente_dni || "-"}</div>
                  <div><b>Médico:</b> {v.medico_nombre || "Venta directa"}</div>
                  <div><b>Vendido por:</b> {v.usuario_nombre || v.usuario_id}</div>
                  <div><b>Estado:</b> <span className="capitalize">{v.estado}</span></div>
                </div>
                <button className="mt-3 w-full px-3 py-2 rounded" style={{ background: "var(--color-primary-light)", color: "var(--color-secondary)" }} onClick={() => verDetalle(v)}>Ver detalle</button>
              </div>
            ))}
          </div>

          {/* Paginación */}
          <div className="flex flex-wrap justify-between items-center gap-3 mt-4">
            <span className="text-sm">Página {pagina} de {Math.max(1, Math.ceil(totalVentas / tamanoPagina))}</span>
            <div className="flex gap-2">
              <button className="px-2 py-1 bg-gray-200 rounded" disabled={pagina === 1} onClick={() => setPagina(pagina - 1)}>Anterior</button>
              <button className="px-2 py-1 bg-gray-200 rounded" disabled={pagina >= Math.ceil(totalVentas / tamanoPagina)} onClick={() => setPagina(pagina + 1)}>Siguiente</button>
            </div>
          </div>
        </>
      )}

      {/* Modal de detalles */}
      {modalOpen && detalleVenta && (
        <div className="fixed inset-0 bg-black bg-opacity-30 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-lg p-6 w-full max-w-lg relative max-h-[90vh] overflow-hidden flex flex-col">
              <button
                className="absolute top-2 right-2 text-gray-500 text-xl"
                onClick={() => {
                  if (detalleAbortRef.current) {
                    detalleAbortRef.current.abort();
                  }
                  setModalOpen(false);
                }}
              >
                ✕
              </button>
            <h3 className="text-xl font-bold mb-2" style={{ color: "var(--color-secondary)" }}>Detalle de Venta</h3>
            <div className="mb-2 text-sm text-gray-700">
              <div><b>Referencia:</b> {detalleVenta.referencia || "-"}</div>
              <div><b>Paciente:</b> {detalleVenta.paciente_nombre || "-"}</div>
              <div><b>DNI:</b> {detalleVenta.paciente_dni || "-"}</div>
              <div><b>Médico:</b> {detalleVenta.medico_nombre || "Venta directa"}</div>
              <div><b>Vendido por:</b> {detalleVenta.usuario_nombre || detalleVenta.usuario_id}</div>
              <div><b>Fecha:</b> {detalleVenta.fecha}</div>
              <div><b>Total:</b> S/ {detalleVenta.total}</div>
            </div>
            <div className="overflow-y-scroll overflow-x-auto h-[44vh]">
              <table className="w-full text-sm border mb-2 min-w-[520px]">
                <thead>
                  <tr style={{ background: "var(--color-primary-light)" }}>
                    <th className="p-2">Medicamento</th>
                    <th className="p-2">Cantidad</th>
                    <th className="p-2">Precio Unitario</th>
                    <th className="p-2">Subtotal</th>
                  </tr>
                </thead>
                <tbody>
                  {detalleLoading ? (
                    <tr>
                      <td className="p-2 text-center text-gray-500" colSpan={4}>Cargando detalle...</td>
                    </tr>
                  ) : detalles.length === 0 ? (
                    <tr>
                      <td className="p-2 text-center text-gray-500" colSpan={4}>No hay detalle disponible.</td>
                    </tr>
                  ) : (
                    detalles.map((d, index) => (
                      <tr key={d.id || `${d.descripcion}-${index}`}>
                        <td className="p-2">{d.descripcion}</td>
                        <td className="p-2">{d.cantidad}</td>
                        <td className="p-2">S/ {d.precio_unitario}</td>
                        <td className="p-2">S/ {d.subtotal}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

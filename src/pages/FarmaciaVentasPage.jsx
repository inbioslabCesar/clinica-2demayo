
import { useEffect, useState } from "react";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import * as XLSX from "xlsx";
import { BASE_URL } from "../config/config";

export default function FarmaciaVentasPage() {
  const [ventas, setVentas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [detalleVenta, setDetalleVenta] = useState(null);
  const [detalles, setDetalles] = useState([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [fechaInicio, setFechaInicio] = useState("");
  const [fechaFin, setFechaFin] = useState("");
  const [pagina, setPagina] = useState(1);
  const [tamanoPagina, setTamanoPagina] = useState(3);
  const [totalVentas, setTotalVentas] = useState(0);

  const cargarVentas = () => {
    setLoading(true);
    let url = `${BASE_URL}api_cotizaciones_farmacia.php`;
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
    url += "?" + params.join("&");
    fetch(url, { credentials: "include" })
      .then(res => {
        if (!res.ok) {
          throw new Error(`Error HTTP: ${res.status}`);
        }
        return res.json();
      })
      .then(data => {
        setVentas(data.cotizaciones || []);
        setTotalVentas(data.total || 0);
        setLoading(false);
      })
      .catch(err => {
        setLoading(false);
        console.error("Error al cargar ventas:", err);
        alert("Error al cargar ventas: " + err.message);
      });
  };

  useEffect(() => {
    cargarVentas();
    // eslint-disable-next-line
  }, [fechaInicio, fechaFin, pagina, tamanoPagina]);

  const verDetalle = (venta) => {
    setDetalleVenta(venta);
    setModalOpen(true);
    fetch(`${BASE_URL}api_cotizaciones_farmacia.php?cotizacion_id=${venta.id}`, { credentials: "include" })
      .then(res => res.json())
      .then(data => {
        setDetalles(data.cotizacion?.detalles || []);
      });
  };

  // Exportar a PDF
  const exportarPDF = () => {
    const doc = new jsPDF();
    doc.text("Ventas de Farmacia", 14, 14);
    autoTable(doc, {
      head: [["Fecha", "Paciente", "DNI", "Usuario", "Total", "Estado"]],
      body: ventas.map(v => [v.fecha, v.paciente_nombre || "-", v.paciente_dni || "-", v.usuario_nombre || v.usuario_id, v.total, v.estado]),
    });
    doc.save("ventas_farmacia.pdf");
  };

  // Exportar a Excel
  const exportarExcel = () => {
    const ws = XLSX.utils.json_to_sheet(ventas.map(v => ({
      Fecha: v.fecha,
      Paciente: v.paciente_nombre || "-",
      DNI: v.paciente_dni || "-",
      Usuario: v.usuario_nombre || v.usuario_id,
      Total: v.total,
      Estado: v.estado
    })));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Ventas");
    XLSX.writeFile(wb, "ventas_farmacia.xlsx");
  };

  return (
    <div className="max-w-5xl mx-auto p-6 bg-white rounded-xl shadow-lg mt-8">
      <h2 className="text-2xl font-bold text-blue-800 mb-4">Ventas de Farmacia</h2>
      <div className="flex gap-4 mb-4 items-center">
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
        <button className="px-3 py-1 bg-blue-600 text-white rounded" onClick={cargarVentas}>Filtrar</button>
        {(fechaInicio || fechaFin) && (
          <button className="px-2 py-1 bg-gray-200 text-gray-700 rounded" onClick={() => { setFechaInicio(""); setFechaFin(""); }}>Limpiar</button>
        )}
      </div>
      {loading ? (
        <div className="text-center text-gray-500 py-8">Cargando ventas...</div>
      ) : ventas.length === 0 ? (
        <div className="text-center text-gray-500 py-8">No hay ventas registradas.</div>
      ) : (
        <>
          <table className="w-full text-sm border">
            <thead>
              <tr className="bg-blue-50">
                <th className="p-2">Fecha</th>
                <th className="p-2">Paciente</th>
                <th className="p-2">DNI</th>
                <th className="p-2">Usuario</th>
                <th className="p-2">Total</th>
                <th className="p-2">Estado</th>
                <th className="p-2">Detalle</th>
              </tr>
            </thead>
            <tbody>
              {ventas.map(v => (
                <tr key={v.id} className="border-b">
                  <td className="p-2">{v.fecha}</td>
                  <td className="p-2">{v.paciente_nombre || v.paciente_nombre || "-"}</td>
                  <td className="p-2">{v.paciente_dni || "-"}</td>
                  <td className="p-2">{v.usuario_nombre || v.usuario_id}</td>
                  <td className="p-2 font-bold text-blue-700">S/ {v.total}</td>
                  <td className="p-2">{v.estado}</td>
                  <td className="p-2">
                    <button className="px-2 py-1 bg-blue-100 text-blue-700 rounded" onClick={() => verDetalle(v)}>Ver</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {/* Paginación */}
          <div className="flex justify-between items-center mt-4">
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
          <div className="bg-white rounded-lg shadow-lg p-6 w-full max-w-lg relative">
              <button className="absolute top-2 right-2 text-gray-500 text-xl" onClick={() => setModalOpen(false)}>✕</button>
            <h3 className="text-xl font-bold mb-2 text-blue-700">Detalle de Venta</h3>
            <div className="mb-2 text-sm text-gray-700">
              <div><b>Paciente:</b> {detalleVenta.paciente_nombre || "-"}</div>
              <div><b>DNI:</b> {detalleVenta.paciente_dni || "-"}</div>
              <div><b>Usuario:</b> {detalleVenta.usuario_nombre || detalleVenta.usuario_id}</div>
              <div><b>Fecha:</b> {detalleVenta.fecha}</div>
              <div><b>Total:</b> S/ {detalleVenta.total}</div>
            </div>
            <table className="w-full text-sm border mb-2">
              <thead>
                <tr className="bg-blue-50">
                  <th className="p-2">Medicamento</th>
                  <th className="p-2">Cantidad</th>
                  <th className="p-2">Precio Unitario</th>
                  <th className="p-2">Subtotal</th>
                </tr>
              </thead>
              <tbody>
                {detalles.map(d => (
                  <tr key={d.id}>
                    <td className="p-2">{d.descripcion}</td>
                    <td className="p-2">{d.cantidad}</td>
                    <td className="p-2">S/ {d.precio_unitario}</td>
                    <td className="p-2">S/ {d.subtotal}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

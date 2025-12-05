import React, { useEffect, useState, useMemo } from "react";
import { BASE_URL } from "../config/config";
import { exportToExcel, exportToPDF } from "../utils/exportUtils";


export default function DescuentosPage() {
  const [descuentos, setDescuentos] = useState([]);
  const [busqueda, setBusqueda] = useState("");
  const [loading, setLoading] = useState(true);
  const [fecha, setFecha] = useState("");
  const [total, setTotal] = useState(0);
  const [pagina, setPagina] = useState(1);
  const [registrosPorPagina, setRegistrosPorPagina] = useState(3);

  useEffect(() => {
    cargarDescuentos();
    // eslint-disable-next-line
  }, [fecha, pagina, registrosPorPagina]);

  const cargarDescuentos = async () => {
    setLoading(true);
    const params = new URLSearchParams({
      fecha: fecha,
      limit: registrosPorPagina,
      offset: (pagina - 1) * registrosPorPagina
    });
    const res = await fetch(`${BASE_URL}api_descuentos.php?${params}`);
    const data = await res.json();
    if (data.success) {
      setDescuentos(data.descuentos);
      setTotal(data.total);
    }
    setLoading(false);
  };

  // Columnas para exportación
  const exportColumns = [
    { key: 'fecha', label: 'Fecha' },
    { key: 'hora', label: 'Hora' },
    { key: 'usuario_nombre', label: 'Usuario' },
    { key: 'paciente_nombre', label: 'Paciente' },
    { key: 'servicio', label: 'Servicio' },
    { key: 'monto_original', label: 'Monto Original' },
    { key: 'tipo_descuento', label: 'Tipo Descuento' },
    { key: 'valor_descuento', label: 'Valor' },
    { key: 'monto_descuento', label: 'Monto Descuento' },
    { key: 'monto_final', label: 'Monto Final' },
    { key: 'motivo', label: 'Motivo' },
  ];

  // Filtro dinámico
  const descuentosFiltrados = useMemo(() => {
    if (!busqueda.trim()) return descuentos;
    const texto = busqueda.trim().toLowerCase();
    return descuentos.filter(d =>
      (d.paciente_nombre && d.paciente_nombre.toLowerCase().includes(texto)) ||
      (d.usuario_nombre && d.usuario_nombre.toLowerCase().includes(texto)) ||
      (d.servicio && d.servicio.toLowerCase().includes(texto)) ||
      (d.motivo && d.motivo.toLowerCase().includes(texto)) ||
      (d.fecha && d.fecha.includes(texto)) ||
      (d.hora && d.hora.includes(texto))
    );
  }, [busqueda, descuentos]);

  return (
    <div className="max-w-7xl mx-auto p-6">
      <h1 className="text-3xl font-bold mb-8 text-orange-700 text-center">Descuentos Aplicados</h1>
      <div className="mb-6 flex flex-col md:flex-row gap-4 items-center justify-between">
        <div className="flex gap-4 items-center">
          <label className="font-semibold">Filtrar por fecha:</label>
          <input type="date" value={fecha} onChange={e => { setFecha(e.target.value); setPagina(1); }} className="border px-4 py-2 rounded-lg" />
          {fecha && (
            <button
              onClick={() => { setFecha(""); setPagina(1); }}
              className="ml-2 px-3 py-2 rounded bg-gray-200 hover:bg-gray-300 text-gray-700 text-xs font-semibold"
              title="Limpiar filtro de fecha"
            >Limpiar</button>
          )}
        </div>
        <div className="flex gap-2 items-center">
          <label className="font-semibold">Filas por página:</label>
          <select value={registrosPorPagina} onChange={e => { setRegistrosPorPagina(Number(e.target.value)); setPagina(1); }} className="border px-2 py-1 rounded-lg">
            <option value={3}>3</option>
            <option value={5}>5</option>
            <option value={10}>10</option>
          </select>
        </div>
        <div className="flex gap-2 items-center mt-2 md:mt-0">
          <input
            type="text"
            value={busqueda}
            onChange={e => { setBusqueda(e.target.value); setPagina(1); }}
            placeholder="Buscar paciente, usuario, servicio, motivo..."
            className="border px-3 py-2 rounded-lg w-48 md:w-64"
          />
          <button
            onClick={() => exportToExcel(descuentos, exportColumns)}
            className="bg-green-600 hover:bg-green-700 text-white px-3 py-2 rounded font-semibold text-sm"
          >Exportar Excel</button>
          <button
            onClick={() => exportToPDF(descuentos, exportColumns)}
            className="bg-red-600 hover:bg-red-700 text-white px-3 py-2 rounded font-semibold text-sm"
          >Exportar PDF</button>
        </div>
      </div>
      {loading ? (
        <div className="text-center py-12 text-gray-500">Cargando...</div>
      ) : (
        <div className="overflow-x-auto bg-white rounded-xl shadow-lg">
          <div className="min-w-[700px] md:min-w-full">
            <table className="w-full text-xs md:text-sm lg:text-base">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-2 md:px-4 py-2 whitespace-nowrap">Fecha</th>
                  <th className="px-2 md:px-4 py-2 whitespace-nowrap">Hora</th>
                  <th className="px-2 md:px-4 py-2 whitespace-nowrap">Usuario</th>
                  <th className="px-2 md:px-4 py-2 whitespace-nowrap">Paciente</th>
                  <th className="px-2 md:px-4 py-2 whitespace-nowrap">Servicio</th>
                  <th className="px-2 md:px-4 py-2 whitespace-nowrap">Monto Original</th>
                  <th className="px-2 md:px-4 py-2 whitespace-nowrap">Tipo Descuento</th>
                  <th className="px-2 md:px-4 py-2 whitespace-nowrap">Valor</th>
                  <th className="px-2 md:px-4 py-2 whitespace-nowrap">Monto Descuento</th>
                  <th className="px-2 md:px-4 py-2 whitespace-nowrap">Monto Final</th>
                  <th className="px-2 md:px-4 py-2 whitespace-nowrap">Motivo</th>
                </tr>
              </thead>
              <tbody>
                {descuentosFiltrados.length === 0 ? (
                  <tr><td colSpan={11} className="text-center py-8 text-gray-500">No hay descuentos registrados</td></tr>
                ) : (
                  descuentosFiltrados.slice(0, registrosPorPagina).map(d => (
                    <tr key={d.id} className="hover:bg-gray-50">
                      <td className="px-2 md:px-4 py-2 whitespace-nowrap">{d.fecha}</td>
                      <td className="px-2 md:px-4 py-2 whitespace-nowrap">{d.hora}</td>
                      <td className="px-2 md:px-4 py-2 whitespace-nowrap">{d.usuario_nombre}</td>
                      <td className="px-2 md:px-4 py-2 whitespace-nowrap">{d.paciente_nombre}</td>
                      <td className="px-2 md:px-4 py-2 whitespace-nowrap">{d.servicio}</td>
                      <td className="px-2 md:px-4 py-2 whitespace-nowrap">S/ {parseFloat(d.monto_original).toFixed(2)}</td>
                      <td className="px-2 md:px-4 py-2 whitespace-nowrap">{d.tipo_descuento}</td>
                      <td className="px-2 md:px-4 py-2 whitespace-nowrap">{d.tipo_descuento === 'porcentaje' ? `${d.valor_descuento}%` : `S/ ${parseFloat(d.valor_descuento).toFixed(2)}`}</td>
                      <td className="px-2 md:px-4 py-2 text-orange-700 font-bold whitespace-nowrap">S/ {parseFloat(d.monto_descuento).toFixed(2)}</td>
                      <td className="px-2 md:px-4 py-2 whitespace-nowrap">S/ {parseFloat(d.monto_final).toFixed(2)}</td>
                      <td className="px-2 md:px-4 py-2 whitespace-nowrap">{d.motivo}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          {/* Paginación */}
          {total > registrosPorPagina && (
            <div className="flex justify-between items-center px-4 py-4">
              <span className="text-sm text-gray-700">Mostrando {(pagina - 1) * registrosPorPagina + 1} - {Math.min(pagina * registrosPorPagina, total)} de {total} descuentos</span>
              <div className="flex gap-2">
                <button disabled={pagina === 1} onClick={() => setPagina(pagina - 1)} className="px-3 py-1 border rounded-lg disabled:opacity-50">Anterior</button>
                <span className="px-4 py-2 bg-orange-600 text-white rounded-lg">{pagina}</span>
                <button disabled={pagina * registrosPorPagina >= total} onClick={() => setPagina(pagina + 1)} className="px-3 py-1 border rounded-lg disabled:opacity-50">Siguiente</button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

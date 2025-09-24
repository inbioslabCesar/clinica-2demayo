import React, { useEffect, useState } from "react";
import { BASE_URL } from "../config/config";
import * as XLSX from "xlsx";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

export default function ListaConsultasPage() {
  const [consultas, setConsultas] = useState([]);
  const [rowsPerPage, setRowsPerPage] = useState(3);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [fechaDesde, setFechaDesde] = useState("");
  const [fechaHasta, setFechaHasta] = useState("");
  const [busqueda, setBusqueda] = useState("");

  useEffect(() => {
    fetch(BASE_URL + "api_consultas.php")
      .then((res) => res.json())
      .then((data) => {
        if (data.success) setConsultas(data.consultas);
        else setError(data.error || "Error al cargar consultas");
        setLoading(false);
      })
      .catch(() => {
        setError("Error de conexión con el servidor");
        setLoading(false);
      });
  }, []);

  // Filtrar por rango de fecha y búsqueda dinámica
  const filtrarConsultas = (lista) => {
    let resultado = lista;
    if (fechaDesde || fechaHasta) {
      resultado = resultado.filter((c) => {
        if (!c.fecha) return false;
        const fecha = c.fecha.slice(0, 10);
        if (fechaDesde && fecha < fechaDesde) return false;
        if (fechaHasta && fecha > fechaHasta) return false;
        return true;
      });
    }
    if (busqueda.trim() !== "") {
      const texto = busqueda.trim().toLowerCase();
      resultado = resultado.filter(
        (c) =>
          (c.paciente_nombre &&
            c.paciente_nombre.toLowerCase().includes(texto)) ||
          (c.paciente_apellido &&
            c.paciente_apellido.toLowerCase().includes(texto)) ||
          (c.medico_nombre && c.medico_nombre.toLowerCase().includes(texto)) ||
          (c.motivo && c.motivo.toLowerCase().includes(texto)) ||
          (c.estado && c.estado.toLowerCase().includes(texto)) ||
          (c.id && c.id.toString().includes(texto))
      );
    }
    return resultado;
  };
  const consultasFiltradas = filtrarConsultas(consultas);
  const totalRows = consultasFiltradas.length;
  const totalPages = Math.max(1, Math.ceil(totalRows / rowsPerPage));
  const pagedConsultas = consultasFiltradas.slice(
    (page - 1) * rowsPerPage,
    page * rowsPerPage
  );

  // Exportar a Excel
  const exportarExcel = () => {
    const ws = XLSX.utils.json_to_sheet(
      consultasFiltradas.map((c) => ({
        ID: c.id,
        Fecha: c.fecha?.slice(0, 16).replace("T", " "),
        Paciente: c.paciente_nombre + " " + c.paciente_apellido,
        Medico: c.medico_nombre,
        Motivo: c.motivo,
        Estado: c.estado,
      }))
    );
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Consultas");
    const excelBuffer = XLSX.write(wb, { bookType: "xlsx", type: "array" });
    const blob = new Blob([excelBuffer], { type: "application/octet-stream" });
    const fecha = new Date().toISOString().slice(0, 10);
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `consultas_${fecha}.xlsx`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Exportar a PDF
  const exportarPDF = () => {
    const doc = new jsPDF();
    doc.text("Lista de Consultas", 14, 10);
    autoTable(doc, {
      head: [["ID", "Fecha", "Paciente", "Médico", "Motivo", "Estado"]],
      body: consultasFiltradas.map((c) => [
        c.id,
        c.fecha?.slice(0, 16).replace("T", " "),
        c.paciente_nombre + " " + c.paciente_apellido,
        c.medico_nombre,
        c.motivo,
        c.estado,
      ]),
      startY: 18,
      styles: { fontSize: 9 },
      headStyles: { fillColor: [59, 130, 246] },
    });
    const fecha = new Date().toISOString().slice(0, 10);
    doc.save(`consultas_${fecha}.pdf`);
  };

  return (
    <div className="max-w-5xl mx-auto p-4">
      <h1 className="text-2xl font-bold mb-6 text-center">
        Lista de Consultas
      </h1>
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <label className="text-sm">Filas por página:</label>
        <select
          value={rowsPerPage}
          onChange={(e) => {
            setRowsPerPage(Number(e.target.value));
            setPage(1);
          }}
          className="border rounded px-2 py-1"
        >
          <option value={3}>3</option>
          <option value={5}>5</option>
          <option value={10}>10</option>
          <option value={25}>25</option>
        </select>
        <input
          type="text"
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          placeholder="Buscar por paciente, médico, motivo, estado o ID..."
          className="border rounded px-2 py-1 min-w-[180px]"
        />
        <label className="text-sm">Desde:</label>
        <input
          type="date"
          value={fechaDesde}
          onChange={(e) => setFechaDesde(e.target.value)}
          className="border rounded px-2 py-1"
        />
        <label className="text-sm">Hasta:</label>
        <input
          type="date"
          value={fechaHasta}
          onChange={(e) => setFechaHasta(e.target.value)}
          className="border rounded px-2 py-1"
        />
        {(fechaDesde || fechaHasta || busqueda) && (
          <button
            onClick={() => {
              setFechaDesde("");
              setFechaHasta("");
              setBusqueda("");
            }}
            className="text-blue-600 underline ml-2"
          >
            Limpiar filtro
          </button>
        )}
        <button
          onClick={exportarExcel}
          className="bg-green-600 text-white px-3 py-1 rounded font-semibold text-xs hover:bg-green-700 transition-all"
        >
          Exportar Excel
        </button>
        <button
          onClick={exportarPDF}
          className="bg-red-600 text-white px-3 py-1 rounded font-semibold text-xs hover:bg-red-700 transition-all"
        >
          Exportar PDF
        </button>
      </div>
      {loading ? (
        <div className="text-center">Cargando...</div>
      ) : error ? (
        <div className="text-center text-red-600">{error}</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full text-xs md:text-sm border bg-white rounded shadow">
            <thead className="bg-blue-100">
              <tr>
                <th className="p-2 w-12 text-center">ID</th>
                <th className="p-2">Fecha</th>
                <th className="p-2">Paciente</th>
                <th className="p-2">Médico</th>
                <th className="p-2">Motivo</th>
                <th className="p-2">Estado</th>
              </tr>
            </thead>
            <tbody>
              {consultasFiltradas.length === 0 ? (
                <tr>
                  <td colSpan={6} className="text-center p-4">
                    No hay consultas registradas
                  </td>
                </tr>
              ) : (
                pagedConsultas.map((c) => (
                  <tr key={c.id} className="border-b hover:bg-blue-50">
                    <td className="p-2 w-12 text-center">{c.id}</td>
                    <td className="p-2">
                      {c.fecha?.slice(0, 16).replace("T", " ")}
                    </td>
                    <td className="p-2">
                      {c.paciente_nombre} {c.paciente_apellido}
                    </td>
                    <td className="p-2">{c.medico_nombre}</td>
                    <td className="p-2">{c.motivo}</td>
                    <td className="p-2">{c.estado}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
          {/* Controles de paginación */}
          <div className="flex justify-end items-center gap-2 mt-2">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
              className="px-2 py-1 rounded bg-gray-200 disabled:opacity-50"
            >
              Anterior
            </button>
            <span className="text-sm">
              Página {page} de {totalPages}
            </span>
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
              className="px-2 py-1 rounded bg-gray-200 disabled:opacity-50"
            >
              Siguiente
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

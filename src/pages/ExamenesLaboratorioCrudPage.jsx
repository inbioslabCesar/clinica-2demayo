

import React, { useEffect, useState } from "react";
import Spinner from "../components/Spinner";
import { BASE_URL } from "../config/config";
import Modal from "../components/Modal";
import ExamenEditorForm from "../components/ExamenEditorForm";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import * as XLSX from "xlsx";
import { saveAs } from "file-saver";


export default function ExamenesLaboratorioCrudPage() {
  // Exportar a PDF
  const handleExportPDF = () => {
    try {
      const doc = new jsPDF();
      doc.text("Exámenes de Laboratorio", 14, 10);
      autoTable(doc, {
        head: [[
          "Nombre", "Metodología", "Tubo", "Frasco", "Tiempo", "Público", "Convenio"
        ]],
        body: filtered.map(ex => [
          ex.nombre, ex.metodologia, ex.tipo_tubo, ex.tipo_frasco, ex.tiempo_resultado, ex.precio_publico, ex.precio_convenio
        ]),
        startY: 18,
        styles: { fontSize: 8 }
      });
      doc.save("examenes_laboratorio.pdf");
    } catch (err) {
      console.error("Error exportando PDF:", err);
      alert("Error exportando PDF. Revisa la consola para más detalles.");
    }
  };

  // Exportar a Excel
  const handleExportExcel = () => {
    const ws = XLSX.utils.json_to_sheet(filtered.map(ex => ({
      Nombre: ex.nombre,
      Metodología: ex.metodologia,
      Tubo: ex.tipo_tubo,
      Frasco: ex.tipo_frasco,
      Tiempo: ex.tiempo_resultado,
      Público: ex.precio_publico,
      Convenio: ex.precio_convenio
    })));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Examenes");
    const wbout = XLSX.write(wb, { bookType: "xlsx", type: "array" });
    saveAs(new Blob([wbout], { type: "application/octet-stream" }), "examenes_laboratorio.xlsx");
  };
  const [rowsPerPage, setRowsPerPage] = useState(3);
  const [page, setPage] = useState(0);
  const [examenes, setExamenes] = useState([]);
  const [search, setSearch] = useState("");
  const [form, setForm] = useState({
    nombre: "",
    metodologia: "",
    valores_referenciales: [],
    precio_publico: "",
    precio_convenio: "",
    tipo_tubo: "",
    tipo_frasco: "",
    tiempo_resultado: "",
    condicion_paciente: "",
    preanalitica: "",
    titulo: "",
    es_subtitulo: false
  });
  const [modalOpen, setModalOpen] = useState(false);
  const [editId, setEditId] = useState(null);
  const [msg, setMsg] = useState("");
  const [loading, setLoading] = useState(false);

  const fetchExamenes = async () => {
    setLoading(true);
    const res = await fetch(BASE_URL + "api_examenes_laboratorio.php", {
      credentials: 'include'
    });
    const data = await res.json();
    setExamenes(data.examenes || []);
    setLoading(false);
  };

  useEffect(() => { fetchExamenes(); }, []);

  const handleChange = e => {
    const { name, value, type, checked } = e.target;
    setForm(f => ({ ...f, [name]: type === 'checkbox' ? checked : value }));
  };

  // Manejar cambios en el editor visual avanzado
  const handleValoresReferencialesChange = (val) => {
    setForm(f => ({ ...f, valores_referenciales: val }));
  };

  const handleSubmit = async e => {
    e.preventDefault();
    setMsg("");
    const method = editId ? "PUT" : "POST";
    const url = BASE_URL + "api_examenes_laboratorio.php" + (editId ? `?id=${editId}` : "");
    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(editId ? { ...form, id: editId } : form),
      credentials: 'include'
    });
    const data = await res.json();
      if (data.success) {
        setMsg(editId ? "Examen actualizado" : "Examen creado");
        setForm({ nombre: "", metodologia: "", valores_referenciales: [{ nombre: "", min: "", max: "", unidad: "" }], precio_publico: "", precio_convenio: "", tipo_tubo: "", tipo_frasco: "", tiempo_resultado: "", condicion_paciente: "", preanalitica: "" });
        setEditId(null);
        setModalOpen(false); // Cerrar el modal
        fetchExamenes();
      } else {
        setMsg("Error al guardar");
    }
  };

  const handleEdit = ex => {
    let valores = [];
    if (Array.isArray(ex.valores_referenciales)) {
      valores = ex.valores_referenciales;
    } else if (typeof ex.valores_referenciales === 'string' && ex.valores_referenciales.trim().length > 0) {
      try {
        const parsed = JSON.parse(ex.valores_referenciales);
        if (Array.isArray(parsed)) valores = parsed;
      } catch (err) {
        console.error('Error al parsear valores_referenciales:', err);
      }
    }
    if (!valores.length) valores = [{ nombre: "", min: "", max: "", unidad: "" }];
    setForm({
      ...ex,
      valores_referenciales: valores,
      titulo: ex.titulo || "",
      es_subtitulo: ex.es_subtitulo || false
    });
    setEditId(ex.id);
    setMsg("");
    setModalOpen(true);
  };

  const handleNew = () => {
    setForm({
      nombre: "",
      metodologia: "",
      valores_referenciales: [{ nombre: "", min: "", max: "", unidad: "" }],
      precio_publico: "",
      precio_convenio: "",
      tipo_tubo: "",
      tipo_frasco: "",
      tiempo_resultado: "",
      condicion_paciente: "",
      preanalitica: "",
      titulo: "",
      es_subtitulo: false
    });
    setEditId(null);
    setMsg("");
    setModalOpen(true);
  };

  const handleDelete = async id => {
    if (!window.confirm("¿Eliminar este examen?")) return;
    const res = await fetch(BASE_URL + `api_examenes_laboratorio.php?id=${id}`, {
      method: "DELETE",
      credentials: 'include'
    });
    const data = await res.json();
    if (data.success) {
      setMsg("Examen eliminado");
      fetchExamenes();
    } else {
      setMsg("Error al eliminar");
    }
  };

  // Filtrar exámenes según búsqueda
  const filtered = examenes.filter(ex =>
    ex.nombre.toLowerCase().includes(search.toLowerCase()) ||
    ex.metodologia.toLowerCase().includes(search.toLowerCase())
  );
  // Calcular paginación
  const totalPages = Math.ceil(filtered.length / rowsPerPage);
  const paginated = filtered.slice(page * rowsPerPage, (page + 1) * rowsPerPage);

  return (
    <div className="w-full max-w-md sm:max-w-2xl mx-auto p-1 sm:p-4 bg-white rounded shadow mt-1 sm:mt-6">
      <h2 className="text-2xl font-bold mb-4 text-center">Gestión de Exámenes de Laboratorio</h2>
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-2">
        <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
          <input
            type="text"
            value={search}
            onChange={e => { setSearch(e.target.value); setPage(0); }}
            placeholder="Buscar por nombre o metodología..."
            className="border rounded p-2 text-xs w-full sm:w-64"
          />
          <div className="flex gap-1 mt-2 sm:mt-0">
            <button onClick={handleExportPDF} type="button" className="bg-red-600 text-white px-3 py-2 rounded text-xs hover:bg-red-700">PDF</button>
            <button onClick={handleExportExcel} type="button" className="bg-green-600 text-white px-3 py-2 rounded text-xs hover:bg-green-700">Excel</button>
          </div>
        </div>
        <button onClick={handleNew} className="bg-blue-600 text-white px-4 py-2 rounded shadow hover:bg-blue-700 transition-all text-xs sm:text-sm ml-0 sm:ml-2 mt-2 sm:mt-0">
          + Nuevo examen
        </button>
      </div>
      {msg && <div className="mb-4 text-center text-green-700 font-semibold">{msg}</div>}
      <Modal open={modalOpen} onClose={() => setModalOpen(false)}>
        <h3 className="text-lg font-bold mb-2 text-center">{editId ? "Editar examen" : "Nuevo examen"}</h3>
  <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-2 gap-1 md:gap-4 mb-2 md:mb-4 text-xs sm:text-sm">
          <input name="nombre" value={form.nombre} onChange={handleChange} placeholder="Nombre del examen" className="border p-1 sm:p-2 rounded" required />
          <input name="metodologia" value={form.metodologia} onChange={handleChange} placeholder="Metodología" className="border p-1 sm:p-2 rounded" />
          <div className="col-span-1 md:col-span-2">
            <label className="font-semibold">Parámetros, subtítulos, valores de referencia, fórmulas y estilos:</label>
            <ExamenEditorForm initialData={form.valores_referenciales} onChange={handleValoresReferencialesChange} />
          </div>
          {/* Previsualización visual tipo formato de laboratorio */}
          <div className="col-span-1 md:col-span-2 mt-2">
            <label className="font-semibold">Previsualización del formato de resultados:</label>
            <div className="bg-white border rounded p-2 mt-1 overflow-auto" style={{ maxHeight: '320px', fontSize: '13px' }}>
              <table className="min-w-full text-xs">
                <thead>
                  <tr className="bg-gray-100">
                    <th className="p-1">Examen / Parámetro</th>
                    <th className="p-1">Metodología</th>
                    <th className="p-1">Resultado</th>
                    <th className="p-1">Unidades</th>
                    <th className="p-1">Valores de Referencia</th>
                  </tr>
                </thead>
                <tbody>
                  {Array.isArray(form.valores_referenciales) && form.valores_referenciales.length > 0 ? (
                    form.valores_referenciales
                      .sort((a, b) => (a.orden || 0) - (b.orden || 0))
                      .map((item, idx) => (
                        item.tipo === "Subtítulo" ? (
                          <tr key={idx}>
                            <td colSpan={5} className={`py-2 px-1 ${item.negrita ? "font-bold" : "font-semibold"}`} style={{ background: item.color_fondo, color: item.color_texto, fontWeight: item.negrita ? 'bold' : 'normal' }}>
                              {item.nombre}
                            </td>
                          </tr>
                        ) : (
                          <tr key={idx}>
                            <td className="py-1 px-1" style={{ background: item.color_fondo, color: item.color_texto, fontWeight: item.negrita ? 'bold' : 'normal' }}>{item.nombre}</td>
                            <td className="py-1 px-1 text-center">{item.metodologia || ''}</td>
                            <td className="py-1 px-1 text-center text-gray-400">[Resultado]</td>
                            <td className="py-1 px-1 text-center">{item.unidad || ''}</td>
                            <td className="py-1 px-1 text-center">
                              {item.referencias && item.referencias.length > 0 ? (
                                <ul className="list-none p-0 m-0">
                                  {item.referencias.map((ref, rIdx) => (
                                    <li key={rIdx}>
                                        <span className="text-gray-700">
                                          {ref.valor || ''}
                                          {(ref.valor_min || ref.valor_max) && (
                                            <> ({ref.valor_min ? ref.valor_min : '-'} - {ref.valor_max ? ref.valor_max : '-'})</>
                                          )}
                                        </span>
                                        {ref.desc && <span className="text-gray-500 ml-1">({ref.desc})</span>}
                                    </li>
                                  ))}
                                </ul>
                              ) : <span className="text-gray-400">-</span>}
                            </td>
                          </tr>
                        )
                      ))
                  ) : (
                    <tr><td colSpan={5} className="text-center text-gray-400">Sin parámetros definidos</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
          <input name="precio_publico" value={form.precio_publico} onChange={handleChange} placeholder="Precio público" className="border p-1 sm:p-2 rounded" type="number" min="0" />
          <input name="precio_convenio" value={form.precio_convenio} onChange={handleChange} placeholder="Precio convenio" className="border p-1 sm:p-2 rounded" type="number" min="0" />
          <input name="tipo_tubo" value={form.tipo_tubo} onChange={handleChange} placeholder="Tipo de tubo" className="border p-1 sm:p-2 rounded" />
          <input name="tipo_frasco" value={form.tipo_frasco} onChange={handleChange} placeholder="Tipo de frasco" className="border p-1 sm:p-2 rounded" />
          <input name="tiempo_resultado" value={form.tiempo_resultado} onChange={handleChange} placeholder="Tiempo de resultado" className="border p-1 sm:p-2 rounded" />
          <input name="condicion_paciente" value={form.condicion_paciente} onChange={handleChange} placeholder="Condición del paciente" className="border p-1 sm:p-2 rounded" />
          <input name="preanalitica" value={form.preanalitica} onChange={handleChange} placeholder="Preanalítica" className="border p-1 sm:p-2 rounded" />
          <div className="col-span-1 md:col-span-2 flex flex-col md:flex-row gap-1 md:gap-2 mt-1">
            <button type="submit" className="bg-blue-600 text-white px-4 py-2 rounded w-full md:w-auto">{editId ? "Actualizar" : "Crear"}</button>
            <button type="button" className="bg-gray-400 text-white px-4 py-2 rounded w-full md:w-auto" onClick={() => { setEditId(null); setForm({ nombre: "", metodologia: "", valores_referenciales: [], precio_publico: "", precio_convenio: "", tipo_tubo: "", tipo_frasco: "", tiempo_resultado: "", condicion_paciente: "", preanalitica: "" }); setModalOpen(false); }}>Cancelar</button>
          </div>
        </form>
      </Modal>
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-2">
        <div className="flex items-center gap-2">
          <label className="text-xs">Filas por página:</label>
          <select value={rowsPerPage} onChange={e => { setRowsPerPage(Number(e.target.value)); setPage(0); }} className="border rounded p-1 text-xs">
            <option value={3}>3</option>
            <option value={5}>5</option>
            <option value={10}>10</option>
          </select>
        </div>
        <div className="flex items-center gap-2 text-xs">
          <button disabled={page === 0} onClick={() => setPage(p => Math.max(0, p - 1))} className="px-2 py-1 rounded bg-gray-200 disabled:opacity-50">&lt;</button>
          <span>Página {page + 1} de {totalPages || 1}</span>
          <button disabled={page >= totalPages - 1} onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))} className="px-2 py-1 rounded bg-gray-200 disabled:opacity-50">&gt;</button>
        </div>
      </div>
      <div className="overflow-x-auto rounded border border-gray-200 mt-2">
        <table className="min-w-full text-[10px] sm:text-xs md:text-sm ">
          <thead className="sticky top-0 z-10">
            <tr className="bg-gray-200 text-[9px] sm:text-xs md:text-sm">
              <th className="p-2">Nombre</th>
              <th className="p-2">Metodología</th>
              <th className="p-2">Tubo</th>
              <th className="p-2">Frasco</th>
              <th className="p-2">Tiempo</th>
              <th className="p-2">Condición</th>
              <th className="p-2">Preanalítica</th>
              <th className="p-2">Público</th>
              <th className="p-2">Convenio</th>
              <th className="p-2">Acciones</th>
            </tr>
          </thead>
          <tbody className="bg-white">
            {loading ? (
              <tr><td colSpan={12} className="text-center p-4"><Spinner message="Cargando exámenes de laboratorio..." /></td></tr>
            ) : examenes.length === 0 ? (
              <tr><td colSpan={12} className="text-center p-4">Sin exámenes registrados</td></tr>
            ) : (
              paginated.map(ex => (
                <tr key={ex.id} className="border-b hover:bg-gray-50 text-[9px] sm:text-xs md:text-sm">
                  <td className="p-2">
                    {ex.titulo && (
                      <span className={ex.es_subtitulo ? "font-bold" : "font-semibold text-gray-700"}>{ex.titulo}</span>
                    )}
                    {ex.nombre && (
                      <div>{ex.nombre}</div>
                    )}
                  </td>
                  <td className="p-2">{ex.metodologia}</td>
              {/* Columna de valores referenciales eliminada para ahorrar espacio visual */}
                  <td className="p-2">{ex.tipo_tubo}</td>
                  <td className="p-2">{ex.tipo_frasco}</td>
                  <td className="p-2">{ex.tiempo_resultado}</td>
                  <td className="p-2">{ex.condicion_paciente}</td>
                  <td className="p-2">{ex.preanalitica}</td>
                  <td className="p-2">S/ {ex.precio_publico}</td>
                  <td className="p-2">S/ {ex.precio_convenio}</td>
                  <td className="p-1 flex flex-col md:flex-row gap-1 md:gap-2">
                    <button className="bg-yellow-400 text-white px-2 py-1 rounded w-full md:w-auto" onClick={() => handleEdit(ex)}>Editar</button>
                    <button className="bg-red-600 text-white px-2 py-1 rounded w-full md:w-auto" onClick={() => handleDelete(ex.id)}>Eliminar</button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

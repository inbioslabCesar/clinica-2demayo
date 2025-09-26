import { useEffect, useState } from "react";
import { BASE_URL } from "../config/config";
import Modal from "../components/Modal";
import ExamenEditorForm from "../components/ExamenEditorForm";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import * as XLSX from "xlsx";
import { saveAs } from "file-saver";

export default function ExamenesLaboratorioCrudPage() {
  const [viewMode, setViewMode] = useState('table');
  const [rowsPerPage, setRowsPerPage] = useState(5);
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
    es_subtitulo: false,
  });
  const [modalOpen, setModalOpen] = useState(false);
  const [editId, setEditId] = useState(null);
  const [msg, setMsg] = useState("");
  const [msgType, setMsgType] = useState("success");
  const [loading, setLoading] = useState(false);

  // Funciones de exportación
  const handleExportPDF = () => {
    try {
      const doc = new jsPDF();
      doc.text("Exámenes de Laboratorio", 14, 10);
      autoTable(doc, {
        head: [
          [
            "Nombre",
            "Metodología",
            "Tubo",
            "Frasco",
            "Tiempo",
            "Público",
            "Convenio",
          ],
        ],
        body: filtered.map((ex) => [
          ex.nombre,
          ex.metodologia,
          ex.tipo_tubo,
          ex.tipo_frasco,
          ex.tiempo_resultado,
          ex.precio_publico,
          ex.precio_convenio,
        ]),
        startY: 18,
        styles: { fontSize: 8 },
      });
      doc.save("examenes_laboratorio.pdf");
    } catch (err) {
      console.error("Error exportando PDF:", err);
      alert("Error exportando PDF. Revisa la consola para más detalles.");
    }
  };

  const handleExportExcel = () => {
    const ws = XLSX.utils.json_to_sheet(
      filtered.map((ex) => ({
        Nombre: ex.nombre,
        Metodología: ex.metodologia,
        Tubo: ex.tipo_tubo,
        Frasco: ex.tipo_frasco,
        Tiempo: ex.tiempo_resultado,
        Público: ex.precio_publico,
        Convenio: ex.precio_convenio,
      }))
    );
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Examenes");
    const wbout = XLSX.write(wb, { bookType: "xlsx", type: "array" });
    saveAs(
      new Blob([wbout], { type: "application/octet-stream" }),
      "examenes_laboratorio.xlsx"
    );
  };

  const fetchExamenes = async () => {
    setLoading(true);
    const res = await fetch(BASE_URL + "api_examenes_laboratorio.php", {
      credentials: "include",
    });
    const data = await res.json();
    setExamenes(data.examenes || []);
    setLoading(false);
  };

  useEffect(() => {
    fetchExamenes();
  }, []);

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setForm((f) => ({ ...f, [name]: type === "checkbox" ? checked : value }));
  };

  // Manejar cambios en el editor visual avanzado
  const handleValoresReferencialesChange = (val) => {
    setForm((f) => ({ ...f, valores_referenciales: val }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setMsg("");
    setMsgType("success");
    
    try {
      const method = editId ? "PUT" : "POST";
      const url =
        BASE_URL +
        "api_examenes_laboratorio.php" +
        (editId ? `?id=${editId}` : "");
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editId ? { ...form, id: editId } : form),
        credentials: "include",
      });
      const data = await res.json();
      
      if (data.success) {
        setMsg(editId ? "✅ Examen actualizado correctamente" : "✅ Examen creado correctamente");
        setMsgType("success");
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
        });
        setEditId(null);
        setModalOpen(false);
        fetchExamenes();
        
        setTimeout(() => setMsg(""), 3000);
      } else {
        setMsg("❌ " + (data.error || "Error al guardar"));
        setMsgType("error");
      }
    } catch {
      setMsg("❌ Error de conexión");
      setMsgType("error");
    }
  };

  const handleEdit = (ex) => {
    let valores = [];
    if (Array.isArray(ex.valores_referenciales)) {
      valores = ex.valores_referenciales;
    } else if (
      typeof ex.valores_referenciales === "string" &&
      ex.valores_referenciales.trim().length > 0
    ) {
      try {
        const parsed = JSON.parse(ex.valores_referenciales);
        if (Array.isArray(parsed)) valores = parsed;
      } catch (err) {
        console.error("Error al parsear valores_referenciales:", err);
      }
    }
    if (!valores.length)
      valores = [{ nombre: "", min: "", max: "", unidad: "" }];
    setForm({
      ...ex,
      valores_referenciales: valores,
      titulo: ex.titulo || "",
      es_subtitulo: ex.es_subtitulo || false,
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
      es_subtitulo: false,
    });
    setEditId(null);
    setMsg("");
    setModalOpen(true);
  };

  const handleDelete = async (id) => {
    if (!window.confirm("¿Está seguro de eliminar este examen? Esta acción no se puede deshacer.")) return;
    
    try {
      const res = await fetch(
        BASE_URL + `api_examenes_laboratorio.php?id=${id}`,
        {
          method: "DELETE",
          credentials: "include",
        }
      );
      const data = await res.json();
      
      if (data.success) {
        setMsg("✅ Examen eliminado correctamente");
        setMsgType("success");
        fetchExamenes();
        setTimeout(() => setMsg(""), 3000);
      } else {
        setMsg("❌ " + (data.error || "Error al eliminar"));
        setMsgType("error");
      }
    } catch {
      setMsg("❌ Error de conexión");
      setMsgType("error");
    }
  };

  // Filtrar exámenes según búsqueda
  const filtered = examenes.filter(
    (ex) =>
      ex.nombre.toLowerCase().includes(search.toLowerCase()) ||
      ex.metodologia.toLowerCase().includes(search.toLowerCase())
  );
  
  // Calcular estadísticas
  const stats = {
    total: examenes.length,
    conParametros: examenes.filter(ex => ex.valores_referenciales && Array.isArray(ex.valores_referenciales) && ex.valores_referenciales.length > 0).length,
    precioPromedio: examenes.length > 0 ? Math.round(examenes.reduce((acc, ex) => acc + (parseFloat(ex.precio_publico) || 0), 0) / examenes.length) : 0,
    metodologias: [...new Set(examenes.map(ex => ex.metodologia).filter(Boolean))].length
  };
  
  // Calcular paginación
  const totalPages = Math.ceil(filtered.length / rowsPerPage);
  const paginated = filtered.slice(
    page * rowsPerPage,
    (page + 1) * rowsPerPage
  );

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 via-white to-indigo-50">
      {/* Header con gradiente */}
      <div className="bg-gradient-to-r from-purple-600 via-indigo-600 to-blue-600 text-white">
        <div className="max-w-7xl mx-auto px-4 py-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-12 h-12 bg-white/20 backdrop-blur-sm rounded-xl flex items-center justify-center text-2xl">
              🔬
            </div>
            <div>
              <h1 className="text-2xl font-bold">Gestión de Exámenes de Laboratorio</h1>
              <p className="text-purple-100">Administre el catálogo completo de exámenes y pruebas de laboratorio</p>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 py-6">
        {/* Estadísticas Dashboard */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <div className="bg-gradient-to-r from-purple-500 to-indigo-500 rounded-xl p-4 text-white">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-purple-100 text-sm">Total Exámenes</p>
                <p className="text-2xl font-bold">{stats.total}</p>
              </div>
              <div className="w-10 h-10 bg-white/20 backdrop-blur-sm rounded-lg flex items-center justify-center text-xl">
                🧪
              </div>
            </div>
          </div>

          <div className="bg-gradient-to-r from-blue-500 to-cyan-500 rounded-xl p-4 text-white">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-blue-100 text-sm">Con Parámetros</p>
                <p className="text-2xl font-bold">{stats.conParametros}</p>
              </div>
              <div className="w-10 h-10 bg-white/20 backdrop-blur-sm rounded-lg flex items-center justify-center text-xl">
                📊
              </div>
            </div>
          </div>

          <div className="bg-gradient-to-r from-emerald-500 to-green-500 rounded-xl p-4 text-white">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-emerald-100 text-sm">Precio Promedio</p>
                <p className="text-2xl font-bold">S/ {stats.precioPromedio}</p>
              </div>
              <div className="w-10 h-10 bg-white/20 backdrop-blur-sm rounded-lg flex items-center justify-center text-xl">
                💰
              </div>
            </div>
          </div>

          <div className="bg-gradient-to-r from-amber-500 to-orange-500 rounded-xl p-4 text-white">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-amber-100 text-sm">Metodologías</p>
                <p className="text-2xl font-bold">{stats.metodologias}</p>
              </div>
              <div className="w-10 h-10 bg-white/20 backdrop-blur-sm rounded-lg flex items-center justify-center text-xl">
                🔬
              </div>
            </div>
          </div>
        </div>

        {/* Mensaje de estado */}
        {msg && (
          <div className={`mb-6 p-4 rounded-lg border ${
            msgType === "success"
              ? "bg-green-50 text-green-700 border-green-200"
              : "bg-red-50 text-red-700 border-red-200"
          }`}>
            <div className="flex items-center gap-2 font-medium">
              {msg}
            </div>
          </div>
        )}

        {/* Controles principales */}
        <div className="bg-white/80 backdrop-blur-sm rounded-xl shadow-lg border border-white/20 p-6 mb-6">
          <div className="flex flex-col lg:flex-row gap-4 justify-between items-center">
            {/* Búsqueda */}
            <div className="flex-1 max-w-md">
              <div className="relative">
                <input
                  type="text"
                  value={search}
                  onChange={(e) => {
                    setSearch(e.target.value);
                    setPage(0);
                  }}
                  placeholder="🔍 Buscar por nombre o metodología..."
                  className="w-full px-4 py-3 pl-4 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all"
                />
              </div>
            </div>

            {/* Botones de acción */}
            <div className="flex flex-wrap gap-3">
              <button
                onClick={handleExportPDF}
                className="flex items-center gap-2 px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 transition-colors shadow-md"
              >
                📄 PDF
              </button>
              <button
                onClick={handleExportExcel}
                className="flex items-center gap-2 px-4 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 transition-colors shadow-md"
              >
                📊 Excel
              </button>
              <button
                onClick={handleNew}
                className="flex items-center gap-2 px-6 py-2 bg-gradient-to-r from-purple-600 to-indigo-600 text-white rounded-lg hover:from-purple-700 hover:to-indigo-700 transition-all font-medium shadow-lg transform hover:scale-105"
              >
                ➕ Nuevo Examen
              </button>
            </div>
          </div>
        </div>
        {/* Modal modernizado */}
        <Modal open={modalOpen} onClose={() => setModalOpen(false)}>
          <div className="bg-white rounded-xl shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-hidden">
            {/* Header del modal */}
            <div className="bg-gradient-to-r from-purple-600 to-indigo-600 text-white p-6">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-white/20 backdrop-blur-sm rounded-lg flex items-center justify-center">
                  {editId ? "✏️" : "➕"}
                </div>
                <div>
                  <h3 className="text-xl font-bold">
                    {editId ? "Editar Examen" : "Nuevo Examen"}
                  </h3>
                  <p className="text-purple-100">
                    {editId ? "Modifique los datos del examen" : "Complete la información del nuevo examen"}
                  </p>
                </div>
              </div>
            </div>

            {/* Contenido del modal */}
            <div className="p-6 overflow-y-auto max-h-[calc(90vh-200px)]">
              <form
                onSubmit={handleSubmit}
                className="space-y-6"
              >
                {/* Información básica */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2">
                      Nombre del Examen *
                    </label>
                    <input
                      name="nombre"
                      value={form.nombre}
                      onChange={handleChange}
                      placeholder="Ej: Hemograma Completo"
                      className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2">
                      Metodología
                    </label>
                    <input
                      name="metodologia"
                      value={form.metodologia}
                      onChange={handleChange}
                      placeholder="Ej: Citometría de flujo"
                      className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all"
                    />
                  </div>
                </div>

                {/* Parámetros y valores de referencia */}
                <div className="bg-gray-50 rounded-xl p-4">
                  <label className="block text-sm font-semibold text-gray-700 mb-3">
                    🧪 Parámetros y Valores de Referencia
                  </label>
                  <ExamenEditorForm
                    initialData={form.valores_referenciales}
                    onChange={handleValoresReferencialesChange}
                  />
                </div>

                {/* Previsualización */}
                <div className="bg-blue-50 rounded-xl p-4">
                  <label className="block text-sm font-semibold text-gray-700 mb-3">
                    👁️ Previsualización del Formato de Resultados
                  </label>
                  <div className="bg-white border rounded-lg p-4 overflow-auto max-h-80">
                    <table className="min-w-full text-xs">
                      <thead>
                        <tr className="bg-gradient-to-r from-purple-100 to-indigo-100">
                          <th className="p-2 text-left font-semibold">Examen / Parámetro</th>
                          <th className="p-2 text-left font-semibold">Metodología</th>
                          <th className="p-2 text-left font-semibold">Resultado</th>
                          <th className="p-2 text-left font-semibold">Unidades</th>
                          <th className="p-2 text-left font-semibold">Valores de Referencia</th>
                        </tr>
                      </thead>
                      <tbody>
                        {Array.isArray(form.valores_referenciales) &&
                        form.valores_referenciales.length > 0 ? (
                          form.valores_referenciales
                            .sort((a, b) => (a.orden || 0) - (b.orden || 0))
                            .map((item, idx) =>
                              item.tipo === "Subtítulo" ? (
                                <tr key={idx}>
                                  <td
                                    colSpan={5}
                                    className={`py-2 px-2 ${
                                      item.negrita ? "font-bold" : "font-semibold"
                                    }`}
                                    style={{
                                      background: item.color_fondo,
                                      color: item.color_texto,
                                      fontWeight: item.negrita ? "bold" : "normal",
                                    }}
                                  >
                                    {item.nombre}
                                  </td>
                                </tr>
                              ) : (
                                <tr key={idx} className="hover:bg-gray-50">
                                  <td
                                    className="py-2 px-2"
                                    style={{
                                      background: item.color_fondo,
                                      color: item.color_texto,
                                      fontWeight: item.negrita ? "bold" : "normal",
                                    }}
                                  >
                                    {item.nombre}
                                  </td>
                                  <td className="py-2 px-2 text-center">
                                    {item.metodologia || ""}
                                  </td>
                                  <td className="py-2 px-2 text-center text-gray-400">
                                    [Resultado]
                                  </td>
                                  <td className="py-2 px-2 text-center">
                                    {item.unidad || ""}
                                  </td>
                                  <td className="py-2 px-2 text-center">
                                    {item.referencias &&
                                    item.referencias.length > 0 ? (
                                      <ul className="list-none p-0 m-0">
                                        {item.referencias.map((ref, rIdx) => (
                                          <li key={rIdx}>
                                            <span className="text-gray-700">
                                              {ref.valor || ""}
                                              {(ref.valor_min || ref.valor_max) && (
                                                <>
                                                  {" "}
                                                  (
                                                  {ref.valor_min
                                                    ? ref.valor_min
                                                    : "-"}{" "}
                                                  -{" "}
                                                  {ref.valor_max
                                                    ? ref.valor_max
                                                    : "-"}
                                                  )
                                                </>
                                              )}
                                            </span>
                                            {ref.desc && (
                                              <span className="text-gray-500 ml-1">
                                                ({ref.desc})
                                              </span>
                                            )}
                                          </li>
                                        ))}
                                      </ul>
                                    ) : (
                                      <span className="text-gray-400">-</span>
                                    )}
                                  </td>
                                </tr>
                              )
                            )
                        ) : (
                          <tr>
                            <td colSpan={5} className="text-center text-gray-400 py-4">
                              Sin parámetros definidos
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Información adicional */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2">
                      💰 Precio Público (S/)
                    </label>
                    <input
                      name="precio_publico"
                      value={form.precio_publico}
                      onChange={handleChange}
                      placeholder="0.00"
                      className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all"
                      type="number"
                      min="0"
                      step="0.01"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2">
                      🏥 Precio Convenio (S/)
                    </label>
                    <input
                      name="precio_convenio"
                      value={form.precio_convenio}
                      onChange={handleChange}
                      placeholder="0.00"
                      className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all"
                      type="number"
                      min="0"
                      step="0.01"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2">
                      🧪 Tipo de Tubo
                    </label>
                    <input
                      name="tipo_tubo"
                      value={form.tipo_tubo}
                      onChange={handleChange}
                      placeholder="Ej: Tubo con EDTA"
                      className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2">
                      🧪 Tipo de Frasco
                    </label>
                    <input
                      name="tipo_frasco"
                      value={form.tipo_frasco}
                      onChange={handleChange}
                      placeholder="Ej: Frasco estéril"
                      className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2">
                      ⏱️ Tiempo de Resultado
                    </label>
                    <input
                      name="tiempo_resultado"
                      value={form.tiempo_resultado}
                      onChange={handleChange}
                      placeholder="Ej: 2-4 horas"
                      className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2">
                      👤 Condición del Paciente
                    </label>
                    <input
                      name="condicion_paciente"
                      value={form.condicion_paciente}
                      onChange={handleChange}
                      placeholder="Ej: Ayuno 12h"
                      className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2">
                      📋 Preanalítica
                    </label>
                    <input
                      name="preanalitica"
                      value={form.preanalitica}
                      onChange={handleChange}
                      placeholder="Condiciones especiales"
                      className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all"
                    />
                  </div>
                </div>

                {/* Botones de acción */}
                <div className="flex flex-col sm:flex-row gap-4 justify-end pt-6 border-t border-gray-200">
                  <button
                    type="button"
                    onClick={() => {
                      setEditId(null);
                      setForm({
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
                      });
                      setModalOpen(false);
                    }}
                    className="px-6 py-3 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors font-medium border border-gray-300"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    className="px-8 py-3 bg-gradient-to-r from-purple-600 to-indigo-600 text-white rounded-lg hover:from-purple-700 hover:to-indigo-700 transition-all font-medium shadow-lg hover:shadow-xl transform hover:scale-105"
                  >
                    {editId ? "💾 Actualizar Examen" : "✨ Crear Examen"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </Modal>
        {/* Controles de vista y paginación */}
        <div className="flex flex-col sm:flex-row justify-between items-center gap-4 mb-4">
          <div className="flex items-center gap-2">
            <span className="text-sm text-gray-600">Vista:</span>
            <div className="flex bg-gray-100 rounded-lg p-1">
              <button
                onClick={() => setViewMode('table')}
                className={`px-3 py-1 rounded-md text-sm transition-colors ${
                  viewMode === 'table' 
                    ? 'bg-white text-purple-600 shadow-sm' 
                    : 'text-gray-600 hover:text-gray-800'
                }`}
              >
                📊 Tabla
              </button>
              <button
                onClick={() => setViewMode('cards')}
                className={`px-3 py-1 rounded-md text-sm transition-colors ${
                  viewMode === 'cards' 
                    ? 'bg-white text-purple-600 shadow-sm' 
                    : 'text-gray-600 hover:text-gray-800'
                }`}
              >
                🗃️ Tarjetas
              </button>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <label className="text-sm text-gray-600">Por página:</label>
              <select
                value={rowsPerPage}
                onChange={(e) => {
                  setRowsPerPage(Number(e.target.value));
                  setPage(0);
                }}
                className="border border-gray-300 rounded-lg px-3 py-1 text-sm focus:ring-2 focus:ring-purple-500 focus:border-transparent"
              >
                <option value={5}>5</option>
                <option value={10}>10</option>
                <option value={25}>25</option>
                <option value={50}>50</option>
              </select>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-sm text-gray-600">
                {paginated.length} de {filtered.length} exámenes
              </span>
              <div className="flex items-center gap-1">
                <button
                  disabled={page === 0}
                  onClick={() => setPage(p => Math.max(0, p - 1))}
                  className="px-3 py-1 rounded-lg bg-gray-100 disabled:opacity-50 hover:bg-gray-200 transition-colors"
                >
                  ←
                </button>
                <span className="px-3 py-1 text-sm">
                  {page + 1} / {totalPages || 1}
                </span>
                <button
                  disabled={page >= totalPages - 1}
                  onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
                  className="px-3 py-1 rounded-lg bg-gray-100 disabled:opacity-50 hover:bg-gray-200 transition-colors"
                >
                  →
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Contenido principal */}
        {loading ? (
          <div className="flex items-center justify-center p-12">
            <div className="flex items-center gap-3 text-purple-600">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-600"></div>
              <span className="text-lg">Cargando exámenes de laboratorio...</span>
            </div>
          </div>
        ) : examenes.length === 0 ? (
          <div className="bg-white/80 backdrop-blur-sm rounded-xl shadow-lg border border-white/20 p-12 text-center">
            <div className="text-6xl mb-4">🔬</div>
            <p className="text-gray-600 text-lg mb-4">No hay exámenes registrados</p>
            <button
              onClick={handleNew}
              className="px-6 py-3 bg-gradient-to-r from-purple-600 to-indigo-600 text-white rounded-lg hover:from-purple-700 hover:to-indigo-700 transition-all font-medium shadow-lg transform hover:scale-105"
            >
              ➕ Crear Primer Examen
            </button>
          </div>
        ) : filtered.length === 0 ? (
          <div className="bg-white/80 backdrop-blur-sm rounded-xl shadow-lg border border-white/20 p-8 text-center">
            <div className="text-6xl mb-4">🔍</div>
            <p className="text-gray-600 text-lg">No se encontraron exámenes con los filtros aplicados</p>
          </div>
        ) : (
          <>
            {/* Vista de tabla */}
            {viewMode === 'table' && (
              <div className="bg-white/80 backdrop-blur-sm rounded-xl shadow-lg border border-white/20 overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-gradient-to-r from-purple-500 to-indigo-500 text-white">
                      <tr>
                        <th className="px-4 py-3 text-left text-sm font-medium">Nombre</th>
                        <th className="px-4 py-3 text-left text-sm font-medium hidden md:table-cell">Metodología</th>
                        <th className="px-4 py-3 text-left text-sm font-medium hidden lg:table-cell">Tubo/Frasco</th>
                        <th className="px-4 py-3 text-left text-sm font-medium hidden lg:table-cell">Tiempo</th>
                        <th className="px-4 py-3 text-left text-sm font-medium">Precios</th>
                        <th className="px-4 py-3 text-left text-sm font-medium">Acciones</th>
                      </tr>
                    </thead>
                    <tbody>
                      {paginated.map((ex) => (
                        <tr key={ex.id} className="border-b border-gray-100 hover:bg-purple-50/50 transition-colors">
                          <td className="px-4 py-4">
                            <div className="flex items-center gap-3">
                              <div className="w-8 h-8 bg-purple-100 rounded-lg flex items-center justify-center text-purple-600 text-sm">
                                🧪
                              </div>
                              <div>
                                {ex.titulo && (
                                  <div className={`text-sm ${
                                    ex.es_subtitulo ? "font-bold text-gray-900" : "font-semibold text-gray-700"
                                  }`}>
                                    {ex.titulo}
                                  </div>
                                )}
                                <div className="font-medium text-gray-900">{ex.nombre}</div>
                              </div>
                            </div>
                          </td>
                          <td className="px-4 py-4 text-sm text-gray-600 hidden md:table-cell">
                            {ex.metodologia}
                          </td>
                          <td className="px-4 py-4 text-sm text-gray-600 hidden lg:table-cell">
                            <div className="space-y-1">
                              {ex.tipo_tubo && <div>📍 {ex.tipo_tubo}</div>}
                              {ex.tipo_frasco && <div>🧪 {ex.tipo_frasco}</div>}
                            </div>
                          </td>
                          <td className="px-4 py-4 text-sm text-gray-600 hidden lg:table-cell">
                            <div className="space-y-1">
                              {ex.tiempo_resultado && <div>⏱️ {ex.tiempo_resultado}</div>}
                              {ex.condicion_paciente && <div>👤 {ex.condicion_paciente}</div>}
                            </div>
                          </td>
                          <td className="px-4 py-4">
                            <div className="space-y-1">
                              <div className="text-sm">
                                <span className="text-gray-600">Público:</span> 
                                <span className="font-semibold text-green-600 ml-1">S/ {ex.precio_publico}</span>
                              </div>
                              <div className="text-sm">
                                <span className="text-gray-600">Convenio:</span>
                                <span className="font-semibold text-blue-600 ml-1">S/ {ex.precio_convenio}</span>
                              </div>
                            </div>
                          </td>
                          <td className="px-4 py-4">
                            <div className="flex gap-2">
                              <button
                                onClick={() => handleEdit(ex)}
                                className="px-3 py-1.5 bg-amber-500 text-white rounded-lg hover:bg-amber-600 transition-colors text-sm font-medium shadow-md"
                              >
                                ✏️ Editar
                              </button>
                              <button
                                onClick={() => handleDelete(ex.id)}
                                className="px-3 py-1.5 bg-red-500 text-white rounded-lg hover:bg-red-600 transition-colors text-sm font-medium shadow-md"
                              >
                                🗑️ Eliminar
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Vista de tarjetas */}
            {viewMode === 'cards' && (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {paginated.map((ex) => (
                  <div key={ex.id} className="bg-white/80 backdrop-blur-sm rounded-xl shadow-lg border border-white/20 p-6 hover:shadow-xl transition-all transform hover:scale-105">
                    <div className="flex items-center justify-between mb-4">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-purple-100 rounded-lg flex items-center justify-center text-purple-600">
                          🧪
                        </div>
                        <div className="text-lg font-bold text-gray-900 line-clamp-1">
                          {ex.nombre}
                        </div>
                      </div>
                    </div>

                    <div className="space-y-3">
                      {ex.titulo && (
                        <div>
                          <p className="text-xs text-gray-500 uppercase tracking-wide">Título</p>
                          <p className={`text-sm ${
                            ex.es_subtitulo ? "font-bold text-gray-900" : "font-semibold text-gray-700"
                          }`}>
                            {ex.titulo}
                          </p>
                        </div>
                      )}
                      
                      {ex.metodologia && (
                        <div>
                          <p className="text-xs text-gray-500 uppercase tracking-wide">Metodología</p>
                          <p className="text-sm text-gray-700">{ex.metodologia}</p>
                        </div>
                      )}

                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <p className="text-xs text-gray-500 uppercase tracking-wide">Precio Público</p>
                          <p className="text-lg font-bold text-green-600">S/ {ex.precio_publico}</p>
                        </div>
                        <div>
                          <p className="text-xs text-gray-500 uppercase tracking-wide">Precio Convenio</p>
                          <p className="text-lg font-bold text-blue-600">S/ {ex.precio_convenio}</p>
                        </div>
                      </div>

                      {(ex.tipo_tubo || ex.tipo_frasco) && (
                        <div>
                          <p className="text-xs text-gray-500 uppercase tracking-wide">Muestras</p>
                          <div className="space-y-1">
                            {ex.tipo_tubo && <p className="text-sm text-gray-700">📍 {ex.tipo_tubo}</p>}
                            {ex.tipo_frasco && <p className="text-sm text-gray-700">🧪 {ex.tipo_frasco}</p>}
                          </div>
                        </div>
                      )}

                      {(ex.tiempo_resultado || ex.condicion_paciente) && (
                        <div>
                          <p className="text-xs text-gray-500 uppercase tracking-wide">Información</p>
                          <div className="space-y-1">
                            {ex.tiempo_resultado && <p className="text-sm text-gray-700">⏱️ {ex.tiempo_resultado}</p>}
                            {ex.condicion_paciente && <p className="text-sm text-gray-700">👤 {ex.condicion_paciente}</p>}
                          </div>
                        </div>
                      )}
                    </div>

                    <div className="mt-6 pt-4 border-t border-gray-200 flex gap-3">
                      <button
                        onClick={() => handleEdit(ex)}
                        className="flex-1 bg-gradient-to-r from-amber-500 to-orange-500 text-white py-2.5 px-4 rounded-lg hover:from-amber-600 hover:to-orange-600 transition-all font-medium text-sm shadow-md"
                      >
                        ✏️ Editar
                      </button>
                      <button
                        onClick={() => handleDelete(ex.id)}
                        className="flex-1 bg-gradient-to-r from-red-500 to-pink-500 text-white py-2.5 px-4 rounded-lg hover:from-red-600 hover:to-pink-600 transition-all font-medium text-sm shadow-md"
                      >
                        🗑️ Eliminar
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

import { useEffect, useState } from "react";
import { BASE_URL } from "../config/config";
import ExamenesStatsBar from "../components/examenes/ExamenesStatsBar";
import ExamenesFilterBar from "../components/examenes/ExamenesFilterBar";
import ExamenesTable from "../components/examenes/ExamenesTable";
import ExamenesCards from "../components/examenes/ExamenesCards";
import ExamenModal from "../components/examenes/ExamenModal";
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
    categoria: "",
    metodologia: "",
    valores_referenciales: [{ tipo: "Parámetro", nombre: "", metodologia: "", unidad: "", referencias: [], formula: "" }],
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

  // Normalizar valores_referenciales antes de guardar/enviar
  const normalizeValoresReferenciales = (raw) => {
    if (!raw) return [];
    try {
      if (typeof raw === 'string') {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) raw = parsed;
        else return [];
      }
    } catch (e) {
      console.error('Error parsing valores_referenciales:', e);
      return [];
    }
    return raw.map((it, idx) => ({
      tipo: it.tipo || 'Parámetro',
      nombre: it.nombre || (it.titulo || '') || `Item ${idx + 1}`,
      metodologia: it.metodologia || '',
      unidad: it.unidad || '',
      referencias: Array.isArray(it.referencias) ? it.referencias : [],
      formula: it.formula || '',
      negrita: !!it.negrita,
      color_texto: it.color_texto || '#000000',
      color_fondo: it.color_fondo || '#ffffff',
      orden: typeof it.orden === 'number' ? it.orden : idx + 1
    }));
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
      // Normalizar valores_referenciales antes de enviar
      const payload = { ...form, valores_referenciales: normalizeValoresReferenciales(form.valores_referenciales) };
      if (editId) payload.id = editId;
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        credentials: "include",
      });
      const data = await res.json();
      
      if (data.success) {
        setMsg(editId ? "✅ Examen actualizado correctamente" : "✅ Examen creado correctamente");
        setMsgType("success");
        setForm({
          nombre: "",
          metodologia: "",
          valores_referenciales: [{ tipo: "Parámetro", nombre: "", metodologia: "", unidad: "", referencias: [], formula: "" }],
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
    const valores = normalizeValoresReferenciales(ex.valores_referenciales);
    setForm({
      ...ex,
      categoria: ex.categoria || "",
      valores_referenciales: valores.length ? valores : [{ tipo: "Parámetro", nombre: "", metodologia: "", unidad: "", referencias: [], formula: "" }],
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
      categoria: "",
      metodologia: "",
      valores_referenciales: [{ tipo: "Parámetro", nombre: "", metodologia: "", unidad: "", referencias: [], formula: "" }],
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
  // Filtro de categoría
  const [categoriaFilter, setCategoriaFilter] = useState("");
  // Obtener categorías únicas
  const categorias = Array.from(new Set(examenes.map(ex => ex.categoria).filter(Boolean)));

  const filtered = examenes.filter(
    (ex) =>
      (ex.nombre.toLowerCase().includes(search.toLowerCase()) ||
      ex.metodologia.toLowerCase().includes(search.toLowerCase())) &&
      (categoriaFilter === "" || ex.categoria === categoriaFilter)
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
          <ExamenesStatsBar stats={stats} />

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
          <ExamenesFilterBar
            search={search}
            setSearch={val => { setSearch(val); setPage(0); }}
            categoriaFilter={categoriaFilter}
            setCategoriaFilter={val => { setCategoriaFilter(val); setPage(0); }}
            categorias={categorias}
            onExportPDF={handleExportPDF}
            onExportExcel={handleExportExcel}
            onNew={handleNew}
          />
        {/* Modal modernizado */}
          <ExamenModal
            open={modalOpen}
            onClose={() => setModalOpen(false)}
            form={form}
            setForm={setForm}
            editId={editId}
            setEditId={setEditId}
            msg={msg}
            setMsg={setMsg}
            msgType={msgType}
            setMsgType={setMsgType}
            handleSubmit={handleSubmit}
            handleChange={handleChange}
            handleValoresReferencialesChange={handleValoresReferencialesChange}
          />
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
              {viewMode === 'table' ? (
                <ExamenesTable
                  paginated={paginated}
                  handleEdit={handleEdit}
                  handleDelete={handleDelete}
                  page={page}
                  setPage={setPage}
                  totalPages={totalPages}
                  rowsPerPage={rowsPerPage}
                  setRowsPerPage={setRowsPerPage}
                  filteredLength={filtered.length}
                />
              ) : (
                <ExamenesCards
                  paginated={paginated}
                  handleEdit={handleEdit}
                  handleDelete={handleDelete}
                />
              )}
            </>
          )}
      </div>
    </div>
  );
}

import React, { useEffect, useState } from "react";
import Swal from 'sweetalert2';

import axios from "axios";
import * as XLSX from "xlsx";
import { saveAs } from "file-saver";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

import Spinner from "./Spinner";
import { BASE_URL } from "../config/config";

function MedicoList() {
  // Ordenamiento
  const [sortBy, setSortBy] = useState("id");
  const [sortDir, setSortDir] = useState("asc");

  const handleSort = (col) => {
    if (sortBy === col) {
      setSortDir(sortDir === "asc" ? "desc" : "asc");
    } else {
      setSortBy(col);
      setSortDir("asc");
    }
    setPage(1);
  };
  // Exportar a Excel
  const exportarExcel = (medicosFiltrados) => {
  // Solo exportar columnas relevantes
  const data = medicosFiltrados.map(({ id, nombre, especialidad, email }) => ({ id, nombre, especialidad, email }));
  const ws = XLSX.utils.json_to_sheet(data);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Médicos");
  const excelBuffer = XLSX.write(wb, { bookType: "xlsx", type: "array" });
  const blob = new Blob([excelBuffer], { type: "application/octet-stream" });
  saveAs(blob, `medicos_${new Date().toISOString().slice(0,10)}.xlsx`);
  };

  // Exportar a PDF
  const exportarPDF = (medicosFiltrados) => {
    const doc = new jsPDF();
    doc.text("Médicos", 14, 10);
    const columns = [
      { header: "ID", dataKey: "id" },
      { header: "Nombre", dataKey: "nombre" },
      { header: "Especialidad", dataKey: "especialidad" },
      { header: "Email", dataKey: "email" }
    ];
    autoTable(doc, {
      columns,
      body: medicosFiltrados,
      startY: 18,
      styles: { fontSize: 9 },
      headStyles: { fillColor: [59, 130, 246] }
    });
    doc.save(`medicos_${new Date().toISOString().slice(0,10)}.pdf`);
  };
  // Búsqueda
  const [busqueda, setBusqueda] = useState("");
  // Paginación
  const [rowsPerPage, setRowsPerPage] = useState(5);
  const [page, setPage] = useState(1);
  const [medicos, setMedicos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState({
    nombre: "",
    especialidad: "",
    email: "",
    password: ""
  });
  const [editModal, setEditModal] = useState(false);
  const [editForm, setEditForm] = useState({
    id: null,
    nombre: "",
    especialidad: "",
    email: "",
    password: ""
  });
  const [editError, setEditError] = useState("");
  const [editSaving, setEditSaving] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [deleteError, setDeleteError] = useState("");
  const [formError, setFormError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchMedicos();
  }, []);

  const fetchMedicos = async () => {
    setLoading(true);
    try {
      const res = await axios.get(BASE_URL + "api_medicos.php");
      setMedicos(res.data.medicos || []);
      setError(null);
    } catch (err) {
      setError("Error al cargar médicos");
    }
    setLoading(false);
  };

  const handleInputChange = (e) => {
    setForm({ ...form, [e.target.name]: e.target.value });
  };

  const handleOpenModal = () => {
    setForm({ nombre: "", especialidad: "", email: "", password: "" });
    setFormError("");
    setShowModal(true);
  };

  const handleCloseModal = () => {
    setShowModal(false);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.nombre || !form.especialidad || !form.email || !form.password) {
      setFormError("Nombre, especialidad, email y contraseña son obligatorios");
      return;
    }
    setSaving(true);
    try {
      await axios.post(BASE_URL + "api_medicos.php", form);
      setShowModal(false);
      fetchMedicos();
    } catch (err) {
      setFormError("Error al guardar médico");
    }
    setSaving(false);
  };

  // Abrir modal de edición
  const handleEditOpen = (medico) => {
  setEditForm({ ...medico, password: "" });
    setEditError("");
    setEditModal(true);
  };

  // Cerrar modal de edición
  const handleEditClose = () => {
    setEditModal(false);
  };

  // Cambios en el formulario de edición
  const handleEditChange = (e) => {
    setEditForm({ ...editForm, [e.target.name]: e.target.value });
  };

  // Guardar edición
  const handleEditSubmit = async (e) => {
    e.preventDefault();
    if (!editForm.nombre || !editForm.especialidad || !editForm.email) {
      setEditError("Nombre, especialidad y email son obligatorios");
      return;
    }
    setEditSaving(true);
    try {
      await axios.put(BASE_URL + "api_medicos.php", editForm);
      setEditModal(false);
      fetchMedicos();
    } catch (err) {
      setEditError("Error al editar médico");
    }
    setEditSaving(false);
  };

  // Eliminar médico
  const handleEliminar = (medico) => {
    Swal.fire({
      title: '¿Eliminar médico?',
      text: 'Esta acción no se puede deshacer',
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'Sí, eliminar',
      cancelButtonText: 'Cancelar'
    }).then((result) => {
      if (result.isConfirmed) {
        setDeleteLoading(true);
        fetch(BASE_URL + "api_medicos.php", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: medico.id })
        })
          .then(res => res.json())
          .then(data => {
            if (data.success) {
              setMedicos(prev => prev.filter(m => m.id !== medico.id));
              Swal.fire('Eliminado', 'Médico eliminado correctamente', 'success');
            } else {
              Swal.fire('Error', data.error || 'Error al eliminar médico', 'error');
            }
            setDeleteLoading(false);
          })
          .catch(() => {
            Swal.fire('Error', 'Error de conexión con el servidor', 'error');
            setDeleteLoading(false);
          });
      }
    });
  };

  return (
    <div className="bg-white p-6 rounded-lg shadow">
      <div className="flex flex-col md:flex-row md:justify-between md:items-center mb-4 gap-2">
        <h2 className="text-2xl font-bold text-purple-800">Médicos</h2>
        <div className="flex flex-wrap items-center gap-2">
          <input
            type="text"
            placeholder="Buscar por nombre, especialidad o email..."
            value={busqueda}
            onChange={e => { setBusqueda(e.target.value); setPage(1); }}
            className="border rounded px-3 py-2"
          />
          <button onClick={handleOpenModal} className="bg-blue-700 text-white px-1 py-0.5 md:px-2 md:py-1 rounded hover:bg-blue-800 text-xs md:text-sm">Nuevo Médico</button>
          <button onClick={() => {
            const texto = busqueda.trim().toLowerCase();
            const medicosFiltrados = medicos.filter(m => {
              if (!texto) return true;
              return (
                (m.nombre && m.nombre.toLowerCase().includes(texto)) ||
                (m.especialidad && m.especialidad.toLowerCase().includes(texto)) ||
                (m.email && m.email.toLowerCase().includes(texto))
              );
            });
            exportarExcel(medicosFiltrados);
          }} className="bg-green-600 text-white px-1 py-0.5 md:px-2 md:py-1 rounded hover:bg-green-700 text-xs md:text-sm">Exportar Excel</button>
          <button onClick={() => {
            const texto = busqueda.trim().toLowerCase();
            const medicosFiltrados = medicos.filter(m => {
              if (!texto) return true;
              return (
                (m.nombre && m.nombre.toLowerCase().includes(texto)) ||
                (m.especialidad && m.especialidad.toLowerCase().includes(texto)) ||
                (m.usuario_id && String(m.usuario_id).toLowerCase().includes(texto))
              );
            });
            exportarPDF(medicosFiltrados);
          }} className="bg-red-600 text-white px-1 py-0.5 md:px-2 md:py-1 rounded hover:bg-red-700 text-xs md:text-sm">Exportar PDF</button>
        </div>
      </div>
      {loading ? (
        <Spinner message="Cargando médicos..." />
      ) : error ? (
        <p className="text-red-600">{error}</p>
      ) : (
        <>
          {/** Filtrado por búsqueda */}
          {(() => {
            const texto = busqueda.trim().toLowerCase();
            let medicosFiltrados = medicos.filter(m => {
              if (!texto) return true;
              return (
                (m.nombre && m.nombre.toLowerCase().includes(texto)) ||
                (m.especialidad && m.especialidad.toLowerCase().includes(texto)) ||
                (m.email && m.email.toLowerCase().includes(texto))
              );
            });
            // Ordenar
            medicosFiltrados = medicosFiltrados.sort((a, b) => {
              let vA = a[sortBy], vB = b[sortBy];
              if (typeof vA === "string") vA = vA.toLowerCase();
              if (typeof vB === "string") vB = vB.toLowerCase();
              if (vA === undefined || vA === null) return 1;
              if (vB === undefined || vB === null) return -1;
              if (vA < vB) return sortDir === "asc" ? -1 : 1;
              if (vA > vB) return sortDir === "asc" ? 1 : -1;
              return 0;
            });
            const totalRows = medicosFiltrados.length;
            const totalPages = Math.ceil(totalRows / rowsPerPage);
            const startIdx = (page - 1) * rowsPerPage;
            const endIdx = startIdx + rowsPerPage;
            const medicosPagina = medicosFiltrados.slice(startIdx, endIdx);
            const sortIcon = (col) => sortBy === col ? (sortDir === "asc" ? "▲" : "▼") : "";
            return <>
              <div className="overflow-x-auto w-full">
                <table className="min-w-full text-xs md:text-sm border">
                <thead>
                  <tr className="bg-blue-100">
                    <th className="border px-2 py-1 cursor-pointer" onClick={() => handleSort("id")}>ID {sortIcon("id")}</th>
                    <th className="border px-2 py-1 cursor-pointer" onClick={() => handleSort("nombre")}>Nombre {sortIcon("nombre")}</th>
                    <th className="border px-2 py-1 hidden md:table-cell cursor-pointer" onClick={() => handleSort("especialidad")}>Especialidad {sortIcon("especialidad")}</th>
                    <th className="border px-2 py-1 hidden md:table-cell cursor-pointer" onClick={() => handleSort("email")}>Email {sortIcon("email")}</th>
                    <th className="border px-2 py-1">Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {medicosPagina.map((medico) => (
                    <tr key={medico.id} className="hover:bg-blue-50">
                      <td className="border px-2 py-1">{medico.id}</td>
                      <td className="border px-2 py-1">{medico.nombre}</td>
                      <td className="border px-2 py-1 hidden md:table-cell">{medico.especialidad}</td>
                      <td className="border px-2 py-1 hidden md:table-cell">{medico.email}</td>
                      <td className="border px-2 py-1 flex gap-2">
                        <button onClick={() => handleEditOpen(medico)} className="bg-yellow-400 text-white px-2 py-1 rounded">Editar</button>
                        <button onClick={() => handleEliminar(medico)} className="bg-red-600 text-white px-2 py-1 rounded">Eliminar</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
                </table>
              </div>
              {/* Controles de paginación */}
              <div className="flex items-center justify-between mt-4">
                <div>
                  <label className="mr-2">Filas por página:</label>
                  <select value={rowsPerPage} onChange={e => { setRowsPerPage(Number(e.target.value)); setPage(1); }} className="border rounded px-2 py-1">
                    {[5, 10, 20, 50].map(n => <option key={n} value={n}>{n}</option>)}
                  </select>
                </div>
                <div className="flex items-center gap-2">
                  <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} className="px-2 py-1 rounded bg-gray-200 hover:bg-gray-300 disabled:opacity-50">Anterior</button>
                  <span>Página {page} de {totalPages || 1}</span>
                  <button onClick={() => setPage(p => p < totalPages ? p + 1 : p)} disabled={page >= totalPages} className="px-2 py-1 rounded bg-gray-200 hover:bg-gray-300 disabled:opacity-50">Siguiente</button>
                </div>
              </div>
            </>;
          })()}
        </>
      )}
      {/* Modal para agregar médico */}
      {showModal && (
        <div className="fixed inset-0 flex items-center justify-center bg-black bg-opacity-40 z-50">
          <div className="bg-white rounded-lg shadow-lg p-8 w-full max-w-md relative">
            <button
              onClick={handleCloseModal}
              className="absolute top-2 right-2 text-gray-500 hover:text-gray-800"
            >
              &times;
            </button>
            <h3 className="text-xl font-bold mb-4">Nuevo Médico</h3>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block font-medium">Nombre</label>
                <input
                  type="text"
                  name="nombre"
                  value={form.nombre}
                  onChange={handleInputChange}
                  className="w-full border rounded px-3 py-2"
                  required
                />
              </div>
              <div>
                <label className="block font-medium">Especialidad</label>
                <input
                  type="text"
                  name="especialidad"
                  value={form.especialidad}
                  onChange={handleInputChange}
                  className="w-full border rounded px-3 py-2"
                  required
                />
              </div>
              <div>
                <label className="block font-medium">Email</label>
                <input
                  type="email"
                  name="email"
                  value={form.email}
                  onChange={handleInputChange}
                  className="w-full border rounded px-3 py-2"
                  required
                />
              </div>
              <div>
                <label className="block font-medium">Contraseña</label>
                <input
                  type="password"
                  name="password"
                  value={form.password}
                  onChange={handleInputChange}
                  className="w-full border rounded px-3 py-2"
                  required
                  autoComplete="new-password"
                />
              </div>
              {formError && <p className="text-red-600">{formError}</p>}
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={handleCloseModal}
                  className="px-4 py-2 rounded bg-gray-200 hover:bg-gray-300"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-4 py-2 rounded bg-blue-700 text-white hover:bg-blue-800 disabled:opacity-50"
                >
                  {saving ? "Guardando..." : "Guardar"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      {/* Modal para editar médico */}
      {editModal && (
        <div className="fixed inset-0 flex items-center justify-center bg-black bg-opacity-40 z-50">
          <div className="bg-white rounded-lg shadow-lg p-8 w-full max-w-md relative">
            <button
              onClick={handleEditClose}
              className="absolute top-2 right-2 text-gray-500 hover:text-gray-800"
            >
              &times;
            </button>
            <h3 className="text-xl font-bold mb-4">Editar Médico</h3>
            <form onSubmit={handleEditSubmit} className="space-y-4">
              <div>
                <label className="block font-medium">Nombre</label>
                <input
                  type="text"
                  name="nombre"
                  value={editForm.nombre}
                  onChange={handleEditChange}
                  className="w-full border rounded px-3 py-2"
                  required
                />
              </div>
              <div>
                <label className="block font-medium">Especialidad</label>
                <input
                  type="text"
                  name="especialidad"
                  value={editForm.especialidad}
                  onChange={handleEditChange}
                  className="w-full border rounded px-3 py-2"
                  required
                />
              </div>
              <div>
                <label className="block font-medium">Email</label>
                <input
                  type="email"
                  name="email"
                  value={editForm.email}
                  onChange={handleEditChange}
                  className="w-full border rounded px-3 py-2"
                  required
                />
              </div>
              <div>
                <label className="block font-medium">Contraseña (dejar vacío para no cambiar)</label>
                <input
                  type="password"
                  name="password"
                  value={editForm.password}
                  onChange={handleEditChange}
                  className="w-full border rounded px-3 py-2"
                  autoComplete="new-password"
                />
              </div>
              {editError && <p className="text-red-600">{editError}</p>}
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={handleEditClose}
                  className="px-4 py-2 rounded bg-gray-200 hover:bg-gray-300"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={editSaving}
                  className="px-4 py-2 rounded bg-yellow-500 text-white hover:bg-yellow-600 disabled:opacity-50"
                >
                  {editSaving ? "Guardando..." : "Guardar cambios"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export default MedicoList;

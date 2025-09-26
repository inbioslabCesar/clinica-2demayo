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
    <div className="bg-gradient-to-br from-blue-50 via-purple-50 to-pink-50 min-h-screen">
      {/* Encabezado mejorado con gradiente */}
      <div className="bg-gradient-to-r from-blue-600 via-purple-600 to-pink-500 text-white p-4 md:p-6">
        <div className="flex flex-col lg:flex-row lg:justify-between lg:items-center gap-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-white/20 rounded-lg backdrop-blur-sm">
              <svg className="h-8 w-8 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
              </svg>
            </div>
            <div>
              <h1 className="text-2xl md:text-3xl font-bold">Gestión de Médicos</h1>
              <p className="text-white/90 text-sm">Personal médico especializado</p>
            </div>
          </div>
          
          <div className="flex flex-col sm:flex-row gap-3">
            <button onClick={handleOpenModal} className="bg-white/20 backdrop-blur-sm text-white px-4 py-2 rounded-xl hover:bg-white/30 transition-all duration-200 flex items-center justify-center gap-2 font-medium border border-white/20">
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              <span className="hidden sm:inline">Nuevo Médico</span>
              <span className="sm:hidden">Nuevo</span>
            </button>
            
            <div className="flex gap-2">
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
              }} className="bg-green-500/80 backdrop-blur-sm text-white px-3 py-2 rounded-xl hover:bg-green-600/80 transition-all duration-200 flex items-center justify-center border border-white/20">
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3M3 17V7a2 2 0 012-2h6l2 2h6a2 2 0 012 2v10a2 2 0 01-2 2H5a2 2 0 01-2-2z" />
                </svg>
              </button>
              
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
              }} className="bg-red-500/80 backdrop-blur-sm text-white px-3 py-2 rounded-xl hover:bg-red-600/80 transition-all duration-200 flex items-center justify-center border border-white/20">
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                </svg>
              </button>
            </div>
          </div>
        </div>
        
        {/* Barra de búsqueda mejorada */}
        <div className="mt-6">
          <div className="relative">
            <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
              <svg className="h-5 w-5 text-white/70" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </div>
            <input
              type="text"
              placeholder="Buscar por nombre, especialidad o email..."
              value={busqueda}
              onChange={e => { setBusqueda(e.target.value); setPage(1); }}
              className="w-full pl-12 pr-4 py-3 bg-white/20 backdrop-blur-sm border border-white/30 rounded-xl text-white placeholder-white/70 focus:outline-none focus:ring-2 focus:ring-white/50 focus:border-transparent transition-all duration-200"
            />
            {busqueda && (
              <button
                onClick={() => setBusqueda('')}
                className="absolute inset-y-0 right-0 pr-4 flex items-center text-white/70 hover:text-white"
              >
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Contenedor principal */}
      <div className="p-4 md:p-6">
        <div className="bg-white/80 backdrop-blur-sm rounded-2xl shadow-xl border border-white/20 overflow-hidden">
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
              {/* Vista de escritorio - Tabla */}
              <div className="hidden lg:block overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="bg-gradient-to-r from-blue-500 to-purple-600 text-white">
                      <th className="px-6 py-4 text-left font-semibold cursor-pointer hover:bg-white/10 transition-colors" onClick={() => handleSort("id")}>
                        <div className="flex items-center gap-2">
                          ID {sortIcon("id")}
                        </div>
                      </th>
                      <th className="px-6 py-4 text-left font-semibold cursor-pointer hover:bg-white/10 transition-colors" onClick={() => handleSort("nombre")}>
                        <div className="flex items-center gap-2">
                          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                          </svg>
                          Nombre {sortIcon("nombre")}
                        </div>
                      </th>
                      <th className="px-6 py-4 text-left font-semibold cursor-pointer hover:bg-white/10 transition-colors" onClick={() => handleSort("especialidad")}>
                        <div className="flex items-center gap-2">
                          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
                          </svg>
                          Especialidad {sortIcon("especialidad")}
                        </div>
                      </th>
                      <th className="px-6 py-4 text-left font-semibold cursor-pointer hover:bg-white/10 transition-colors" onClick={() => handleSort("email")}>
                        <div className="flex items-center gap-2">
                          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 12a4 4 0 10-8 0 4 4 0 008 0zm0 0v1.5a2.5 2.5 0 005 0V12a9 9 0 10-9 9m4.5-1.206a8.959 8.959 0 01-4.5 1.207" />
                          </svg>
                          Email {sortIcon("email")}
                        </div>
                      </th>
                      <th className="px-6 py-4 text-center font-semibold">Acciones</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {medicosPagina.map((medico, index) => (
                      <tr key={medico.id} className={`hover:bg-gradient-to-r hover:from-blue-50 hover:to-purple-50 transition-all duration-200 ${index % 2 === 0 ? 'bg-gray-50/50' : 'bg-white'}`}>
                        <td className="px-6 py-4 text-sm text-gray-600">#{medico.id}</td>
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 bg-gradient-to-r from-blue-500 to-purple-600 rounded-full flex items-center justify-center text-white font-semibold text-sm">
                              {medico.nombre ? medico.nombre.charAt(0).toUpperCase() : 'M'}
                            </div>
                            <div>
                              <div className="font-semibold text-gray-900">{medico.nombre}</div>
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800 border border-blue-200">
                            {medico.especialidad}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-sm text-gray-600">{medico.email}</td>
                        <td className="px-6 py-4">
                          <div className="flex justify-center gap-2">
                            <button 
                              onClick={() => handleEditOpen(medico)} 
                              className="bg-gradient-to-r from-amber-400 to-orange-500 text-white px-3 py-1.5 rounded-lg hover:from-amber-500 hover:to-orange-600 transition-all duration-200 flex items-center gap-1 text-sm font-medium"
                            >
                              <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                              </svg>
                              Editar
                            </button>
                            <button 
                              onClick={() => handleEliminar(medico)} 
                              className="bg-gradient-to-r from-red-500 to-red-600 text-white px-3 py-1.5 rounded-lg hover:from-red-600 hover:to-red-700 transition-all duration-200 flex items-center gap-1 text-sm font-medium"
                            >
                              <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                              </svg>
                              Eliminar
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Vista móvil - Tarjetas */}
              <div className="lg:hidden space-y-4 p-4">
                {medicosPagina.map((medico) => (
                  <div key={medico.id} className="bg-gradient-to-br from-white via-blue-50 to-purple-50 rounded-2xl shadow-lg border border-white/20 overflow-hidden hover:shadow-xl transition-all duration-300 transform hover:scale-[1.02]">
                    <div className="bg-gradient-to-r from-blue-500 via-purple-500 to-pink-500 p-4">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className="w-12 h-12 bg-white/20 backdrop-blur-sm rounded-full flex items-center justify-center text-white font-bold text-lg">
                            {medico.nombre ? medico.nombre.charAt(0).toUpperCase() : 'M'}
                          </div>
                          <div>
                            <h3 className="text-white font-bold text-lg">{medico.nombre}</h3>
                            <p className="text-white/80 text-sm">ID: #{medico.id}</p>
                          </div>
                        </div>
                        <div className="text-right">
                          <svg className="h-6 w-6 text-white/80" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
                          </svg>
                        </div>
                      </div>
                    </div>
                    
                    <div className="p-4 space-y-4">
                      <div className="grid grid-cols-1 gap-3">
                        <div className="flex items-center gap-3 p-3 bg-white/60 rounded-xl border border-white/20">
                          <svg className="h-5 w-5 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
                          </svg>
                          <div>
                            <p className="text-xs text-gray-500 uppercase tracking-wide font-semibold">Especialidad</p>
                            <p className="text-gray-900 font-semibold">{medico.especialidad}</p>
                          </div>
                        </div>
                        
                        <div className="flex items-center gap-3 p-3 bg-white/60 rounded-xl border border-white/20">
                          <svg className="h-5 w-5 text-purple-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 12a4 4 0 10-8 0 4 4 0 008 0zm0 0v1.5a2.5 2.5 0 005 0V12a9 9 0 10-9 9m4.5-1.206a8.959 8.959 0 01-4.5 1.207" />
                          </svg>
                          <div>
                            <p className="text-xs text-gray-500 uppercase tracking-wide font-semibold">Email</p>
                            <p className="text-gray-900 font-medium text-sm">{medico.email}</p>
                          </div>
                        </div>
                      </div>
                      
                      <div className="flex gap-3 pt-2">
                        <button 
                          onClick={() => handleEditOpen(medico)} 
                          className="flex-1 bg-gradient-to-r from-amber-400 to-orange-500 text-white py-2.5 px-4 rounded-xl hover:from-amber-500 hover:to-orange-600 transition-all duration-200 flex items-center justify-center gap-2 font-medium"
                        >
                          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                          </svg>
                          Editar
                        </button>
                        <button 
                          onClick={() => handleEliminar(medico)} 
                          className="flex-1 bg-gradient-to-r from-red-500 to-red-600 text-white py-2.5 px-4 rounded-xl hover:from-red-600 hover:to-red-700 transition-all duration-200 flex items-center justify-center gap-2 font-medium"
                        >
                          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                          Eliminar
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Controles de paginación mejorados */}
              <div className="bg-white/60 backdrop-blur-sm px-4 py-6 border-t border-white/20">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                  <div className="flex items-center justify-center sm:justify-start gap-2">
                    <label className="text-sm text-gray-700 font-medium">Filas por página:</label>
                    <select 
                      value={rowsPerPage} 
                      onChange={e => { setRowsPerPage(Number(e.target.value)); setPage(1); }} 
                      className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm bg-white/80 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-transparent"
                    >
                      {[5, 10, 20, 50].map(n => <option key={n} value={n}>{n}</option>)}
                    </select>
                  </div>
                  
                  <div className="flex items-center justify-center gap-2">
                    <button 
                      onClick={() => setPage(p => Math.max(1, p - 1))} 
                      disabled={page === 1} 
                      className="px-4 py-2 rounded-lg bg-gradient-to-r from-blue-500 to-purple-600 text-white hover:from-blue-600 hover:to-purple-700 disabled:from-gray-300 disabled:to-gray-400 disabled:cursor-not-allowed transition-all duration-200 flex items-center gap-2 font-medium"
                    >
                      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                      </svg>
                      <span className="hidden sm:inline">Anterior</span>
                    </button>
                    
                    <div className="flex items-center gap-2 px-4 py-2 bg-white/80 rounded-lg border border-white/20">
                      <span className="text-sm font-medium text-gray-700">
                        Página {page} de {totalPages || 1}
                      </span>
                    </div>
                    
                    <button 
                      onClick={() => setPage(p => p < totalPages ? p + 1 : p)} 
                      disabled={page >= totalPages} 
                      className="px-4 py-2 rounded-lg bg-gradient-to-r from-blue-500 to-purple-600 text-white hover:from-blue-600 hover:to-purple-700 disabled:from-gray-300 disabled:to-gray-400 disabled:cursor-not-allowed transition-all duration-200 flex items-center gap-2 font-medium"
                    >
                      <span className="hidden sm:inline">Siguiente</span>
                      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                      </svg>
                    </button>
                  </div>
                </div>
                
                <div className="text-center mt-3">
                  <span className="text-xs text-gray-500">
                    Mostrando {totalRows === 0 ? 0 : startIdx + 1} - {Math.min(endIdx, totalRows)} de {totalRows} médicos
                  </span>
                </div>
              </div>
            </>;
          })()}
        </>
      )}
      {/* Modal para agregar médico */}
      {showModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-2 sm:p-4">
          <div className="bg-white w-full max-w-md lg:max-w-2xl xl:max-w-3xl rounded-2xl shadow-2xl max-h-[95vh] sm:max-h-[88vh] lg:max-h-[85vh] flex flex-col">
            {/* Header del modal con gradiente */}
            <div className="bg-gradient-to-r from-blue-500 to-purple-600 text-white p-4 sm:p-6 rounded-t-2xl flex-shrink-0">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-white/20 rounded-lg backdrop-blur-sm">
                    <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                    </svg>
                  </div>
                  <div>
                    <h3 className="text-xl font-bold">Registrar Nuevo Médico</h3>
                    <p className="text-white/80 text-sm">Agregar médico al sistema</p>
                  </div>
                </div>
                <button
                  onClick={handleCloseModal}
                  className="p-2 hover:bg-white/20 rounded-lg transition-colors"
                >
                  <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>
            
            {/* Contenido del formulario con scroll mejorado */}
            <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-2 sm:py-4">
              <form id="medico-form" onSubmit={handleSubmit} className="h-full flex flex-col">
                <div className="flex-1 space-y-4 sm:space-y-6 pb-4">
              {/* Sección: Información Personal */}
              <div className="space-y-4">
                <div className="flex items-center gap-2 mb-4">
                  <svg className="h-5 w-5 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                  </svg>
                  <h4 className="text-lg font-semibold text-gray-800">Información Personal</h4>
                </div>
                
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">
                    <span className="flex items-center gap-2">
                      <svg className="h-4 w-4 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                      </svg>
                      Nombre Completo *
                    </span>
                  </label>
                  <input
                    type="text"
                    name="nombre"
                    value={form.nombre}
                    onChange={handleInputChange}
                    className="w-full border border-gray-300 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-transparent transition-all duration-200 bg-gray-50 focus:bg-white"
                    placeholder="Dr. Juan Pérez Martínez"
                    required
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">
                    <span className="flex items-center gap-2">
                      <svg className="h-4 w-4 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
                      </svg>
                      Especialidad Médica *
                    </span>
                  </label>
                  <input
                    type="text"
                    name="especialidad"
                    value={form.especialidad}
                    onChange={handleInputChange}
                    className="w-full border border-gray-300 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-transparent transition-all duration-200 bg-gray-50 focus:bg-white"
                    placeholder="Ej: Cardiología, Pediatría, Medicina General"
                    required
                  />
                </div>
              </div>

              {/* Separador */}
              <div className="border-t border-gray-200 pt-6">
                <div className="flex items-center gap-2 mb-4">
                  <svg className="h-5 w-5 text-purple-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                  </svg>
                  <h4 className="text-lg font-semibold text-gray-800">Credenciales de Acceso</h4>
                </div>                
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2">
                      <span className="flex items-center gap-2">
                        <svg className="h-4 w-4 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 12a4 4 0 10-8 0 4 4 0 008 0zm0 0v1.5a2.5 2.5 0 005 0V12a9 9 0 10-9 9m4.5-1.206a8.959 8.959 0 01-4.5 1.207" />
                        </svg>
                        Email Institucional *
                      </span>
                    </label>
                    <input
                      type="email"
                      name="email"
                      value={form.email}
                      onChange={handleInputChange}
                      className="w-full border border-gray-300 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-transparent transition-all duration-200 bg-gray-50 focus:bg-white"
                      placeholder="doctor@clinica2demayo.com"
                      required
                    />
                  </div>
                  
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2">
                      <span className="flex items-center gap-2">
                        <svg className="h-4 w-4 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                        </svg>
                        Contraseña de Acceso *
                      </span>
                    </label>
                    <input
                      type="password"
                      name="password"
                      value={form.password}
                      onChange={handleInputChange}
                      className="w-full border border-gray-300 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-transparent transition-all duration-200 bg-gray-50 focus:bg-white"
                      placeholder="••••••••"
                      required
                      autoComplete="new-password"
                    />
                    <p className="text-xs text-gray-500 mt-1">Mínimo 8 caracteres recomendados</p>
                  </div>
                </div>
                </div>
                </div>
              </form>
            </div>
            
            {/* Error de validación fuera del scroll */}
            {formError && (
              <div className="mx-4 sm:mx-6 mb-4">
                <div className="bg-red-50 border border-red-200 rounded-xl p-4">
                  <div className="flex items-center gap-2">
                    <svg className="h-5 w-5 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <span className="text-red-700 font-medium">{formError}</span>
                  </div>
                </div>
              </div>
            )}
            
            {/* Botones de acción siempre visibles */}
            <div className="flex flex-col sm:flex-row gap-3 p-4 sm:p-6 border-t border-gray-200 bg-gray-50/50 rounded-b-2xl flex-shrink-0">
              <button
                type="button"
                onClick={handleCloseModal}
                className="flex-1 px-6 py-3 rounded-xl bg-gray-100 text-gray-700 hover:bg-gray-200 transition-all duration-200 font-medium flex items-center justify-center gap-2"
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
                Cancelar
              </button>
              <button
                type="submit"
                form="medico-form"
                  disabled={saving}
                  className="flex-1 px-6 py-3 rounded-xl bg-gradient-to-r from-blue-500 to-purple-600 text-white hover:from-blue-600 hover:to-purple-700 disabled:from-gray-400 disabled:to-gray-500 disabled:cursor-not-allowed transition-all duration-200 font-medium flex items-center justify-center gap-2"
                >
                  {saving ? (
                    <>
                      <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="m4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                      </svg>
                      Guardando...
                    </>
                  ) : (
                    <>
                      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                      </svg>
                      Registrar Médico
                    </>
                  )}
                </button>
              </div>
          </div>
        </div>
      )}
      {/* Modal para editar médico */}
      {editModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-2 sm:p-4">
          <div className="bg-white w-full max-w-md lg:max-w-2xl xl:max-w-3xl rounded-2xl shadow-2xl max-h-[95vh] sm:max-h-[88vh] lg:max-h-[85vh] flex flex-col">
            {/* Header del modal con gradiente */}
            <div className="bg-gradient-to-r from-amber-500 to-orange-600 text-white p-4 sm:p-6 rounded-t-2xl flex-shrink-0">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-white/20 rounded-lg backdrop-blur-sm">
                    <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                    </svg>
                  </div>
                  <div>
                    <h3 className="text-xl font-bold">Editar Médico</h3>
                    <p className="text-white/80 text-sm">Actualizar información del médico</p>
                  </div>
                </div>
                <button
                  onClick={handleEditClose}
                  className="p-2 hover:bg-white/20 rounded-lg transition-colors"
                >
                  <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>
            
            {/* Contenido del formulario con scroll mejorado */}
            <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-2 sm:py-4">
              <form id="edit-medico-form" onSubmit={handleEditSubmit} className="h-full flex flex-col">
                <div className="flex-1 space-y-4 sm:space-y-6 pb-4">
              {/* Sección: Información Personal */}
              <div className="space-y-4">
                <div className="flex items-center gap-2 mb-4">
                  <svg className="h-5 w-5 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                  </svg>
                  <h4 className="text-lg font-semibold text-gray-800">Información Personal</h4>
                </div>
                
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">
                    <span className="flex items-center gap-2">
                      <svg className="h-4 w-4 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                      </svg>
                      Nombre Completo *
                    </span>
                  </label>
                  <input
                    type="text"
                    name="nombre"
                    value={editForm.nombre}
                    onChange={handleEditChange}
                    className="w-full border border-gray-300 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-amber-500/50 focus:border-transparent transition-all duration-200 bg-gray-50 focus:bg-white"
                    placeholder="Dr. Juan Pérez Martínez"
                    required
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">
                    <span className="flex items-center gap-2">
                      <svg className="h-4 w-4 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
                      </svg>
                      Especialidad Médica *
                    </span>
                  </label>
                  <input
                    type="text"
                    name="especialidad"
                    value={editForm.especialidad}
                    onChange={handleEditChange}
                    className="w-full border border-gray-300 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-amber-500/50 focus:border-transparent transition-all duration-200 bg-gray-50 focus:bg-white"
                    placeholder="Ej: Cardiología, Pediatría, Medicina General"
                    required
                  />
                </div>
              </div>

              {/* Separador */}
              <div className="border-t border-gray-200 pt-6">
                <div className="flex items-center gap-2 mb-4">
                  <svg className="h-5 w-5 text-orange-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                  </svg>
                  <h4 className="text-lg font-semibold text-gray-800">Credenciales de Acceso</h4>
                </div>
                
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2">
                      <span className="flex items-center gap-2">
                        <svg className="h-4 w-4 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 12a4 4 0 10-8 0 4 4 0 008 0zm0 0v1.5a2.5 2.5 0 005 0V12a9 9 0 10-9 9m4.5-1.206a8.959 8.959 0 01-4.5 1.207" />
                        </svg>
                        Email Institucional *
                      </span>
                    </label>
                    <input
                      type="email"
                      name="email"
                      value={editForm.email}
                      onChange={handleEditChange}
                      className="w-full border border-gray-300 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-amber-500/50 focus:border-transparent transition-all duration-200 bg-gray-50 focus:bg-white"
                      placeholder="doctor@clinica2demayo.com"
                      required
                    />
                  </div>
                  
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2">
                      <span className="flex items-center gap-2">
                        <svg className="h-4 w-4 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                        </svg>
                        Nueva Contraseña
                      </span>
                    </label>
                    <input
                      type="password"
                      name="password"
                      value={editForm.password}
                      onChange={handleEditChange}
                      className="w-full border border-gray-300 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-amber-500/50 focus:border-transparent transition-all duration-200 bg-gray-50 focus:bg-white"
                      placeholder="••••••••"
                      autoComplete="new-password"
                    />
                    <p className="text-xs text-gray-500 mt-1">Dejar vacío para mantener la contraseña actual</p>
                  </div>
                </div>
                </div>
                </div>
              </form>
            </div>
            
            {/* Error de validación fuera del scroll */}
            {editError && (
              <div className="mx-4 sm:mx-6 mb-4">
                <div className="bg-red-50 border border-red-200 rounded-xl p-4">
                  <div className="flex items-center gap-2">
                    <svg className="h-5 w-5 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <span className="text-red-700 font-medium">{editError}</span>
                  </div>
                </div>
              </div>
            )}
            
            {/* Botones de acción siempre visibles */}
            <div className="flex flex-col sm:flex-row gap-3 p-4 sm:p-6 border-t border-gray-200 bg-gray-50/50 rounded-b-2xl flex-shrink-0">
              <button
                type="button"
                onClick={handleEditClose}
                className="flex-1 px-6 py-3 rounded-xl bg-gray-100 text-gray-700 hover:bg-gray-200 transition-all duration-200 font-medium flex items-center justify-center gap-2"
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
                Cancelar
              </button>
              <button
                type="submit"
                form="edit-medico-form"
                disabled={editSaving}
                className="flex-1 px-6 py-3 rounded-xl bg-gradient-to-r from-amber-500 to-orange-600 text-white hover:from-amber-600 hover:to-orange-700 disabled:from-gray-400 disabled:to-gray-500 disabled:cursor-not-allowed transition-all duration-200 font-medium flex items-center justify-center gap-2"
              >
                {editSaving ? (
                  <>
                    <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="m4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    Guardando...
                  </>
                ) : (
                  <>
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                    </svg>
                    Actualizar Médico
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
      </div>
    </div>
  );
}

export default MedicoList;

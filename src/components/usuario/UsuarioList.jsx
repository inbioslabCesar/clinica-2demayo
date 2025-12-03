import { useEffect, useState } from "react";
import Spinner from "../comunes/Spinner";
import Swal from 'sweetalert2';
import UsuarioForm from "./UsuarioForm";
import { BASE_URL } from "../../config/config";

function UsuarioModal({ open, onClose, initialData, onSave, loading }) {
  if (!open) return null;
  
  const safeInitialData = initialData || {};
  
  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="flex items-end justify-center min-h-screen pt-4 px-4 pb-20 text-center sm:block sm:p-0">
        {/* Fondo oscuro */}
        <div 
          className="fixed inset-0 bg-gray-500 bg-opacity-75 transition-opacity" 
          onClick={onClose}
        ></div>

        {/* Centrar modal */}
        <span className="hidden sm:inline-block sm:align-middle sm:h-screen" aria-hidden="true">&#8203;</span>

        {/* Modal */}
        <div className="inline-block align-bottom bg-white rounded-t-2xl sm:rounded-2xl text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-4xl sm:w-full w-full max-h-full">
          {/* Header del modal */}
          <div className="bg-purple-800 px-4 py-3 sm:px-6 sm:py-4 flex items-center justify-between">
            <h3 className="text-lg font-bold text-white flex items-center gap-2">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
              </svg>
              {initialData ? "Editar Usuario" : "Nuevo Usuario"}
            </h3>
            <button
              onClick={onClose}
              className="bg-purple-700 hover:bg-purple-600 text-white p-2 rounded-full transition-colors"
              aria-label="Cerrar"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Contenido del modal */}
          <div className="bg-white px-4 pt-5 pb-4 sm:p-6 sm:pb-4 max-h-[calc(100vh-120px)] sm:max-h-[80vh] overflow-y-auto">
            <UsuarioForm initialData={safeInitialData} onSubmit={onSave} onCancel={onClose} loading={loading} />
          </div>
        </div>
      </div>
    </div>
  );
}

function UsuarioList() {
  const [usuarios, setUsuarios] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [editData, setEditData] = useState(null);
  const [saving, setSaving] = useState(false);
  const [filtroRol, setFiltroRol] = useState("");
  const [busqueda, setBusqueda] = useState("");
  const [rowsPerPage, setRowsPerPage] = useState(5);
  const [page, setPage] = useState(1);

  const fetchUsuarios = () => {
    setLoading(true);
  fetch(BASE_URL + "api_usuarios.php")
      .then(res => res.json())
      .then(data => {
        setUsuarios(Array.isArray(data) ? data : data.usuarios || []);
        setLoading(false);
      })
      .catch(() => {
        setError("Error de conexión con el servidor");
        setLoading(false);
      });
  };

  useEffect(() => {
    fetchUsuarios();
  }, []);

  const handleAgregar = () => {
    setEditData(null);
    setModalOpen(true);
  };
  const handleEditar = (u) => {
    setEditData(u);
    setModalOpen(true);
  };
  const handleEliminar = (id) => {
    Swal.fire({
      title: '¿Eliminar usuario?',
      text: 'Esta acción no se puede deshacer',
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'Sí, eliminar',
      cancelButtonText: 'Cancelar'
    }).then((result) => {
      if (result.isConfirmed) {
        fetch(BASE_URL + `api_usuarios.php?id=${id}`, { method: "DELETE" })
          .then(res => res.json())
          .then((data) => {
            if (data.success) {
              Swal.fire('Eliminado', 'Usuario eliminado correctamente', 'success');
              fetchUsuarios();
            } else {
              Swal.fire('Error', data.error || 'Error al eliminar usuario', 'error');
            }
          })
          .catch(() => Swal.fire('Error', 'Error de conexión con el servidor', 'error'));
      }
    });
  };
  const handleSave = (form) => {
    setSaving(true);
    
    // Si hay editData, es una edición (PUT), si no, es creación (POST)
    const isEditing = !!editData;
    const method = isEditing ? "PUT" : "POST";
    
    // Para edición, agregar el ID al form
    const dataToSend = isEditing ? { ...form, id: editData.id } : form;
    
    fetch(BASE_URL + "api_usuarios.php", {
      method: method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(dataToSend)
    })
      .then(res => res.json())
      .then(data => {
        setSaving(false);
        if (data.success) {
          setModalOpen(false);
          setEditData(null);
          fetchUsuarios();
          Swal.fire('Éxito', isEditing ? 'Usuario actualizado correctamente' : 'Usuario creado correctamente', 'success');
        } else {
          Swal.fire('Error', data.error || 'Error al procesar usuario', 'error');
        }
      })
      .catch(error => {
        setSaving(false);
        console.error('Error:', error);
        Swal.fire('Error', 'Error de conexión', 'error');
      });
  };

  const roles = ["", "administrador", "medico", "enfermero", "recepcionista", "laboratorista", "quimico"];
  let usuariosFiltrados = usuarios.filter(u => {
    const texto = busqueda.trim().toLowerCase();
    if (filtroRol && u.rol !== filtroRol) return false;
    if (!texto) return true;
    return (
      (u.usuario && u.usuario.toLowerCase().includes(texto)) ||
      (u.nombre && u.nombre.toLowerCase().includes(texto)) ||
      (u.dni && String(u.dni).toLowerCase().includes(texto)) ||
      (u.profesion && u.profesion.toLowerCase().includes(texto))
    );
  });
  const totalRows = usuariosFiltrados.length;
  const totalPages = Math.ceil(totalRows / rowsPerPage);
  const startIdx = (page - 1) * rowsPerPage;
  const endIdx = startIdx + rowsPerPage;
  const usuariosPagina = usuariosFiltrados.slice(startIdx, endIdx);

  const exportarExcel = (usuariosFiltrados) => {
    import("xlsx").then(XLSX => {
      const ws = XLSX.utils.json_to_sheet(usuariosFiltrados);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Usuarios");
      const excelBuffer = XLSX.write(wb, { bookType: "xlsx", type: "array" });
      import("file-saver").then(({ saveAs }) => {
        const blob = new Blob([excelBuffer], { type: "application/octet-stream" });
        saveAs(blob, `usuarios_${new Date().toISOString().slice(0,10)}.xlsx`);
      });
    });
  };

  const getRoleColor = (rol) => {
    const colors = {
      administrador: "bg-red-100 text-red-800 border-red-200",
      medico: "bg-blue-100 text-blue-800 border-blue-200",
      enfermero: "bg-green-100 text-green-800 border-green-200",
      recepcionista: "bg-yellow-100 text-yellow-800 border-yellow-200",
      laboratorista: "bg-purple-100 text-purple-800 border-purple-200",
      quimico: "bg-indigo-100 text-indigo-800 border-indigo-200"
    };
    return colors[rol] || "bg-gray-100 text-gray-800 border-gray-200";
  };

  const getRoleIcon = (rol) => {
    switch(rol) {
      case 'administrador':
        return (
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
        );
      case 'medico':
        return (
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
          </svg>
        );
      case 'enfermero':
        return (
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
        );
      default:
        return (
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
          </svg>
        );
    }
  };
  return (
    <div className="p-4 bg-white rounded shadow">
      {/* Header con título */}
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center mb-4 gap-3">
        <h2 className="text-xl font-bold text-purple-800 flex items-center gap-2">
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197m13.5-9a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0z" />
          </svg>
          Usuarios del Sistema
        </h2>
        
        {/* Botones principales para desktop */}
        <div className="hidden sm:flex flex-wrap items-center gap-2">
          <button 
            onClick={handleAgregar}
            className="bg-blue-500 hover:bg-blue-600 text-white px-4 py-2 rounded-lg font-bold transition-colors flex items-center gap-2"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Agregar Usuario
          </button>
          <button 
            onClick={() => exportarExcel(usuariosFiltrados)}
            className="bg-green-600 hover:bg-green-700 text-white px-3 py-2 rounded-lg font-medium transition-colors flex items-center gap-2"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            Excel
          </button>
        </div>
      </div>

      {/* Botones para móvil */}
      <div className="sm:hidden mb-4">
        <div className="flex gap-2 mb-3">
          <button 
            onClick={handleAgregar}
            className="flex-1 bg-blue-500 hover:bg-blue-600 text-white px-4 py-3 rounded-lg font-bold transition-colors flex items-center justify-center gap-2"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Agregar Usuario
          </button>
        </div>
        <div className="flex gap-2">
          <button 
            onClick={() => exportarExcel(usuariosFiltrados)}
            className="flex-1 bg-green-600 hover:bg-green-700 text-white px-3 py-2 rounded-lg font-medium transition-colors flex items-center justify-center gap-1 text-sm"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            Exportar Excel
          </button>
        </div>
      </div>

      {/* Filtros y búsqueda */}
      <div className="bg-gray-50 rounded-lg p-4 mb-4 space-y-4">
        {/* Buscador */}
        <div className="relative">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
            <svg className="h-5 w-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          </div>
          <input
            type="text"
            value={busqueda}
            onChange={e => { setBusqueda(e.target.value); setPage(1); }}
            placeholder="Buscar por usuario, nombre, DNI o profesión"
            className="block w-full pl-10 pr-3 py-3 border border-gray-300 rounded-lg leading-5 bg-white placeholder-gray-500 focus:outline-none focus:placeholder-gray-400 focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
          />
          {busqueda && (
            <button
              onClick={() => { setBusqueda(""); setPage(1); }}
              className="absolute inset-y-0 right-0 pr-3 flex items-center"
            >
              <svg className="h-5 w-5 text-gray-400 hover:text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>

        {/* Filtros de rol y paginación */}
        <div className="flex flex-col sm:flex-row gap-4">
          {/* Filtro de rol */}
          <div className="flex-1">
            <label className="block text-sm font-medium text-gray-700 mb-2">Filtrar por rol:</label>
            <select 
              value={filtroRol} 
              onChange={e => { setFiltroRol(e.target.value); setPage(1); }} 
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
            >
              {roles.map(r => (
                <option key={r} value={r}>
                  {r ? r.charAt(0).toUpperCase() + r.slice(1) : "Todos los roles"}
                </option>
              ))}
            </select>
          </div>

          {/* Control de filas por página */}
          <div className="sm:w-48">
            <label className="block text-sm font-medium text-gray-700 mb-2">Usuarios por página:</label>
            <select 
              value={rowsPerPage} 
              onChange={e => { setRowsPerPage(Number(e.target.value)); setPage(1); }} 
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
            >
              {[5, 10, 20, 50].map(n => <option key={n} value={n}>{n} usuarios</option>)}
            </select>
          </div>
        </div>

        {/* Contador de resultados */}
        {usuariosFiltrados.length > 0 && (
          <div className="text-sm text-gray-600 bg-white px-3 py-2 rounded-lg border border-gray-200">
            <span className="font-medium">
              {busqueda || filtroRol 
                ? `${usuariosFiltrados.length} usuario${usuariosFiltrados.length !== 1 ? 's' : ''} encontrado${usuariosFiltrados.length !== 1 ? 's' : ''}`
                : `${usuariosFiltrados.length} usuario${usuariosFiltrados.length !== 1 ? 's' : ''} registrado${usuariosFiltrados.length !== 1 ? 's' : ''}`
              }
            </span>
          </div>
        )}
      </div>
      {loading ? (
        <Spinner message="Cargando usuarios..." />
      ) : error ? (
        <div className="text-red-600 bg-red-50 p-4 rounded-lg border border-red-200">{error}</div>
      ) : (
        <>
          {/* Vista de tabla para pantallas grandes */}
          <div className="hidden lg:block overflow-x-auto w-full">
            <table className="min-w-full text-sm border">
              <thead>
                <tr className="bg-blue-100">
                  <th className="px-2 py-1 border">Usuario</th>
                  <th className="px-2 py-1 border">Nombre</th>
                  <th className="px-2 py-1 border">DNI</th>
                  <th className="px-2 py-1 border">Profesión</th>
                  <th className="px-2 py-1 border">Rol</th>
                  <th className="px-2 py-1 border">Estado</th>
                  <th className="px-2 py-1 border">Creado</th>
                  <th className="px-2 py-1 border">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {usuariosPagina.map(u => (
                  <tr key={u.id} className="hover:bg-blue-50">
                    <td className="border px-2 py-1 font-medium">{u.usuario}</td>
                    <td className="border px-2 py-1">{u.nombre}</td>
                    <td className="border px-2 py-1">{u.dni}</td>
                    <td className="border px-2 py-1">{u.profesion}</td>
                    <td className="border px-2 py-1">
                      <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium border ${getRoleColor(u.rol)}`}>
                        {getRoleIcon(u.rol)}
                        <span className="ml-1">{u.rol}</span>
                      </span>
                    </td>
                    <td className="border px-2 py-1">
                      <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
                        u.activo === 1 || u.activo === "1" 
                          ? 'bg-green-100 text-green-800 border border-green-200' 
                          : 'bg-red-100 text-red-800 border border-red-200'
                      }`}>
                        {u.activo === 1 || u.activo === "1" ? "Activo" : "Inactivo"}
                      </span>
                    </td>
                    <td className="border px-2 py-1">{u.creado_en ? u.creado_en.split(" ")[0] : ""}</td>
                    <td className="border px-2 py-1">
                      <div className="flex gap-2">
                        <button onClick={() => handleEditar(u)} className="bg-yellow-400 hover:bg-yellow-500 text-white px-2 py-1 rounded text-sm transition-colors">Editar</button>
                        <button onClick={() => handleEliminar(u.id)} className="bg-red-500 hover:bg-red-600 text-white px-2 py-1 rounded text-sm transition-colors">Eliminar</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Vista de tarjetas para móviles y tablets */}
          <div className="lg:hidden grid grid-cols-1 md:grid-cols-2 gap-4">
            {usuariosPagina.map(u => (
              <div key={u.id} className="bg-gradient-to-br from-blue-50 to-purple-50 border border-blue-200 rounded-lg p-4 shadow-sm hover:shadow-md transition-shadow">
                {/* Header con usuario y acciones */}
                <div className="flex justify-between items-start mb-3">
                  <div>
                    <div className="text-lg font-bold text-purple-800">@{u.usuario}</div>
                    <div className="text-sm text-gray-600">DNI: {u.dni}</div>
                  </div>
                  <div className="flex gap-1">
                    <button 
                      onClick={() => handleEditar(u)} 
                      className="bg-yellow-400 hover:bg-yellow-500 text-white p-2 rounded-full transition-colors"
                      title="Editar usuario"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                      </svg>
                    </button>
                    <button 
                      onClick={() => handleEliminar(u.id)} 
                      className="bg-red-500 hover:bg-red-600 text-white p-2 rounded-full transition-colors"
                      title="Eliminar usuario"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                  </div>
                </div>

                {/* Información del usuario */}
                <div className="space-y-2">
                  <div className="flex justify-between items-center">
                    <span className="font-medium text-blue-800">{u.nombre}</span>
                    <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium border ${getRoleColor(u.rol)}`}>
                      {getRoleIcon(u.rol)}
                      <span className="ml-1">{u.rol}</span>
                    </span>
                  </div>
                  
                  {u.profesion && (
                    <div className="flex items-center gap-2">
                      <svg className="w-4 h-4 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 13.255A23.931 23.931 0 0112 15c-3.183 0-6.22-.62-9-1.745M16 6V4a2 2 0 00-2-2h-4a2 2 0 00-2-2v2m8 0V6a2 2 0 012 2v6a2 2 0 01-2 2H8a2 2 0 01-2-2V8a2 2 0 012-2h8z" />
                      </svg>
                      <span className="text-sm text-blue-700 font-medium">{u.profesion}</span>
                    </div>
                  )}

                  <div className="pt-2 border-t border-blue-200 flex justify-between items-center">
                    <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
                      u.activo === 1 || u.activo === "1" 
                        ? 'bg-green-100 text-green-800 border border-green-200' 
                        : 'bg-red-100 text-red-800 border border-red-200'
                    }`}>
                      {u.activo === 1 || u.activo === "1" ? "● Activo" : "○ Inactivo"}
                    </span>
                    {u.creado_en && (
                      <span className="text-xs text-gray-500">
                        Creado: {u.creado_en.split(" ")[0]}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {/* Controles de paginación mejorados */}
      <div className="flex flex-col sm:flex-row justify-between items-center gap-4 mt-6 pt-4 border-t border-gray-200">
        <div className="text-sm text-gray-600 order-2 sm:order-1">
          Mostrando {usuariosPagina.length} de {usuariosFiltrados.length} registros
        </div>
        
        <div className="flex items-center gap-2 order-1 sm:order-2">
          <button 
            onClick={() => setPage(p => Math.max(1, p - 1))} 
            disabled={page === 1} 
            className="flex items-center gap-1 px-3 py-2 text-sm font-medium text-gray-500 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 hover:text-gray-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            <span className="hidden sm:inline">Anterior</span>
          </button>
          
          <div className="flex items-center gap-1">
            <span className="px-3 py-2 text-sm font-medium text-blue-600 bg-blue-50 border border-blue-200 rounded-lg">
              {page}
            </span>
            <span className="px-2 text-sm text-gray-500">de</span>
            <span className="px-3 py-2 text-sm font-medium text-gray-600 bg-gray-50 border border-gray-200 rounded-lg">
              {totalPages || 1}
            </span>
          </div>
          
          <button 
            onClick={() => setPage(p => p < totalPages ? p + 1 : p)} 
            disabled={page >= totalPages} 
            className="flex items-center gap-1 px-3 py-2 text-sm font-medium text-gray-500 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 hover:text-gray-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <span className="hidden sm:inline">Siguiente</span>
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </button>
        </div>
      </div>
      <UsuarioModal open={modalOpen} onClose={() => setModalOpen(false)} initialData={editData} onSave={handleSave} loading={saving} />
    </div>
  );
}

export default UsuarioList;

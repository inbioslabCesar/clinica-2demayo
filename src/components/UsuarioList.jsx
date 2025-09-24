import React, { useEffect, useState } from "react";
import Spinner from "./Spinner";
import Swal from 'sweetalert2';
import UsuarioForm from "./UsuarioForm";
import { BASE_URL } from "../config/config";

function UsuarioModal({ open, onClose, initialData, onSave, loading }) {
  if (!open) return null;
  // Si initialData es null, pasar un objeto vacío
  const safeInitialData = initialData || {};
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-40">
      <div className="bg-white rounded-lg shadow-lg p-6 min-w-[320px] max-w-lg relative">
        <button
          onClick={onClose}
          className="absolute top-2 right-2 text-gray-500 hover:text-red-500 text-xl font-bold"
          aria-label="Cerrar"
        >
          ×
        </button>
        <UsuarioForm initialData={safeInitialData} onSubmit={onSave} onCancel={onClose} loading={loading} />
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
    const method = editData ? "PUT" : "POST";
  fetch(BASE_URL + "api_usuarios.php", {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(editData ? { ...editData, ...form } : form)
    })
      .then(res => res.json())
      .then(() => {
        setModalOpen(false);
        setSaving(false);
        fetchUsuarios();
      })
      .catch(() => setSaving(false));
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

  // Exportar a Excel
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
  // Exportar a PDF
  const exportarPDF = (usuariosFiltrados) => {
    import("jspdf").then(jsPDF => {
      import("jspdf-autotable").then(autoTable => {
        const doc = new jsPDF.default();
        doc.text("Usuarios", 14, 10);
        const columns = [
          { header: "Usuario", dataKey: "usuario" },
          { header: "Nombre", dataKey: "nombre" },
          { header: "DNI", dataKey: "dni" },
          { header: "Profesión", dataKey: "profesion" },
          { header: "Rol", dataKey: "rol" },
          { header: "Estado", dataKey: "activo" },
          { header: "Creado", dataKey: "creado_en" }
        ];
        const data = usuariosFiltrados.map(u => ({
          ...u,
          activo: u.activo === 1 || u.activo === "1" ? "Activo" : "Inactivo",
          creado_en: u.creado_en ? u.creado_en.split(" ")[0] : ""
        }));
        autoTable.default(doc, {
          columns,
          body: data,
          startY: 18,
          styles: { fontSize: 9 },
          headStyles: { fillColor: [59, 130, 246] }
        });
        doc.save(`usuarios_${new Date().toISOString().slice(0,10)}.pdf`);
      });
    });
  };
  return (
    <div className="p-4 bg-white rounded shadow">
      <div className="flex flex-col md:flex-row md:justify-between md:items-center mb-4 gap-2">
        <h2 className="text-xl font-bold text-purple-800">Usuarios</h2>
        <div className="flex flex-wrap items-center gap-2">
          <input
            type="text"
            placeholder="Buscar por usuario, nombre, DNI, profesión..."
            value={busqueda}
            onChange={e => { setBusqueda(e.target.value); setPage(1); }}
            className="border rounded px-3 py-2"
          />
          <button onClick={handleAgregar} className="bg-blue-500 text-white px-1 py-0.5 md:px-2 md:py-1 rounded font-bold text-xs md:text-sm">Agregar usuario</button>
          <button onClick={() => {
            const texto = busqueda.trim().toLowerCase();
            const filtrados = usuarios.filter(u => {
              if (filtroRol && u.rol !== filtroRol) return false;
              if (!texto) return true;
              return (
                (u.usuario && u.usuario.toLowerCase().includes(texto)) ||
                (u.nombre && u.nombre.toLowerCase().includes(texto)) ||
                (u.dni && String(u.dni).toLowerCase().includes(texto)) ||
                (u.profesion && u.profesion.toLowerCase().includes(texto))
              );
            });
            exportarPDF(filtrados);
          }} className="bg-red-600 text-white px-1 py-0.5 md:px-2 md:py-1 rounded hover:bg-red-700 text-xs md:text-sm">Exportar PDF</button>
        </div>
        {/* Botón Excel solo en móvil */}
        <div className="block md:hidden mt-2">
          <button onClick={() => {
            const texto = busqueda.trim().toLowerCase();
            const filtrados = usuarios.filter(u => {
              if (filtroRol && u.rol !== filtroRol) return false;
              if (!texto) return true;
              return (
                (u.usuario && u.usuario.toLowerCase().includes(texto)) ||
                (u.nombre && u.nombre.toLowerCase().includes(texto)) ||
                (u.dni && String(u.dni).toLowerCase().includes(texto)) ||
                (u.profesion && u.profesion.toLowerCase().includes(texto))
              );
            });
            exportarExcel(filtrados);
          }} className="bg-green-600 text-white px-1 py-0.5 rounded hover:bg-green-700 text-xs w-full">Exportar Excel</button>
        </div>
        {/* Botón Excel en desktop */}
        <div className="hidden md:block">
          <button onClick={() => {
            const texto = busqueda.trim().toLowerCase();
            const filtrados = usuarios.filter(u => {
              if (filtroRol && u.rol !== filtroRol) return false;
              if (!texto) return true;
              return (
                (u.usuario && u.usuario.toLowerCase().includes(texto)) ||
                (u.nombre && u.nombre.toLowerCase().includes(texto)) ||
                (u.dni && String(u.dni).toLowerCase().includes(texto)) ||
                (u.profesion && u.profesion.toLowerCase().includes(texto))
              );
            });
            exportarExcel(filtrados);
          }} className="bg-green-600 text-white px-2 py-1 rounded hover:bg-green-700 text-sm">Exportar Excel</button>
        </div>
      </div>
      <div className="mb-2">
        <label className="mr-2">Filtrar por rol:</label>
        <select value={filtroRol} onChange={e => { setFiltroRol(e.target.value); setPage(1); }} className="border rounded px-2 py-1">
          {roles.map(r => <option key={r} value={r}>{r ? r.charAt(0).toUpperCase() + r.slice(1) : "Todos"}</option>)}
        </select>
      </div>
      {loading ? (
        <Spinner message="Cargando usuarios..." />
      ) : error ? (
        <div className="text-red-600">{error}</div>
      ) : (
        <div className="overflow-x-auto w-full">
          <table className="min-w-full text-xs md:text-sm border">
            <thead>
              <tr className="bg-blue-100">
                <th className="px-1 py-0.5 md:px-2 md:py-1 border">Usuario</th>
                <th className="px-1 py-0.5 md:px-2 md:py-1 border">Nombre</th>
                <th className="px-1 py-0.5 md:px-2 md:py-1 border hidden md:table-cell">DNI</th>
                <th className="px-1 py-0.5 md:px-2 md:py-1 border hidden md:table-cell">Profesión</th>
                <th className="px-1 py-0.5 md:px-2 md:py-1 border hidden md:table-cell">Rol</th>
                <th className="px-1 py-0.5 md:px-2 md:py-1 border hidden md:table-cell">Estado</th>
                <th className="px-1 py-0.5 md:px-2 md:py-1 border hidden md:table-cell">Creado</th>
                <th className="px-1 py-0.5 md:px-2 md:py-1 border">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {usuariosPagina.map(u => (
                <tr key={u.id} className="hover:bg-blue-50">
                  <td className="border px-1 py-0.5 md:px-2 md:py-1">{u.usuario}</td>
                  <td className="border px-1 py-0.5 md:px-2 md:py-1">{u.nombre}</td>
                  <td className="border px-1 py-0.5 md:px-2 md:py-1 hidden md:table-cell">{u.dni}</td>
                  <td className="border px-1 py-0.5 md:px-2 md:py-1 hidden md:table-cell">{u.profesion}</td>
                  <td className="border px-1 py-0.5 md:px-2 md:py-1 hidden md:table-cell">{u.rol}</td>
                  <td className="border px-1 py-0.5 md:px-2 md:py-1 hidden md:table-cell">{u.activo === 1 || u.activo === "1" ? "Activo" : "Inactivo"}</td>
                  <td className="border px-1 py-0.5 md:px-2 md:py-1 hidden md:table-cell">{u.creado_en ? u.creado_en.split(" ")[0] : ""}</td>
                  <td className="border px-1 py-0.5 md:px-2 md:py-1 flex gap-1 md:gap-2">
                    <button onClick={() => handleEditar(u)} className="bg-yellow-400 text-white px-1 py-0.5 md:px-2 md:py-1 rounded text-xs md:text-sm">Editar</button>
                    <button onClick={() => handleEliminar(u.id)} className="bg-red-500 text-white px-1 py-0.5 md:px-2 md:py-1 rounded text-xs md:text-sm">Eliminar</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {/* Controles de paginación */}
          <div className="flex items-center justify-between mt-2 text-xs md:text-sm">
            <div>
              <label className="mr-2">Filas por página:</label>
              <select value={rowsPerPage} onChange={e => { setRowsPerPage(Number(e.target.value)); setPage(1); }} className="border rounded px-1 py-0.5 md:px-2 md:py-1">
                {[5, 10, 20, 50].map(n => <option key={n} value={n}>{n}</option>)}
              </select>
            </div>
            <div className="flex items-center gap-1 md:gap-2">
              <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} className="px-1 py-0.5 md:px-2 md:py-1 rounded bg-gray-200 hover:bg-gray-300 disabled:opacity-50">Anterior</button>
              <span>Página {page} de {totalPages || 1}</span>
              <button onClick={() => setPage(p => p < totalPages ? p + 1 : p)} disabled={page >= totalPages} className="px-1 py-0.5 md:px-2 md:py-1 rounded bg-gray-200 hover:bg-gray-300 disabled:opacity-50">Siguiente</button>
            </div>
          </div>
        </div>
      )}
      <UsuarioModal open={modalOpen} onClose={() => setModalOpen(false)} initialData={editData} onSave={handleSave} loading={saving} />
    </div>
  );
}

export default UsuarioList;

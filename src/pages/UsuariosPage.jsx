import React, { useEffect, useState } from "react";
import UsuarioList from "../components/UsuarioList";

const roles = [
  "administrador",
  "medico",
  "enfermero",
  "recepcionista",
  "laboratorista"
];

function UsuarioForm({ usuario, onSave, onCancel }) {
  const [form, setForm] = useState(
    usuario || {
      usuario: "",
      password: "",
      nombre: "",
      dni: "",
      profesion: "",
      rol: "recepcionista",
      activo: 1
    }
  );

  const handleChange = e => {
    const { name, value } = e.target;
    setForm(f => ({ ...f, [name]: value }));
  };

  const handleSubmit = e => {
    e.preventDefault();
    onSave(form);
  };

  return (
    <form onSubmit={handleSubmit} className="card p-4 shadow mb-4 mx-auto" style={{maxWidth:'500px'}}>
      <div className="mb-3">
        <label className="form-label fw-semibold">Usuario</label>
        <input name="usuario" value={form.usuario} onChange={handleChange} className="form-control" required />
      </div>
      <div className="mb-3">
        <label className="form-label fw-semibold">Contraseña {usuario ? <span className="text-muted small">(dejar vacío para no cambiar)</span> : null}</label>
        <input name="password" type="password" value={form.password} onChange={handleChange} className="form-control" autoComplete="new-password" {...(usuario ? {} : { required: true })} />
      </div>
      <div className="mb-3">
        <label className="form-label fw-semibold">Nombre</label>
        <input name="nombre" value={form.nombre} onChange={handleChange} className="form-control" required />
      </div>
      <div className="mb-3">
        <label className="form-label fw-semibold">DNI</label>
        <input name="dni" value={form.dni} onChange={handleChange} className="form-control" required />
      </div>
      <div className="mb-3">
        <label className="form-label fw-semibold">Profesión</label>
        <input name="profesion" value={form.profesion} onChange={handleChange} className="form-control" required />
      </div>
      <div className="mb-3">
        <label className="form-label fw-semibold">Rol</label>
        <select name="rol" value={form.rol} onChange={handleChange} className="form-select">
          {roles.map(r => <option key={r} value={r}>{r}</option>)}
        </select>
      </div>
      <div className="mb-3">
        <label className="form-label fw-semibold">Activo</label>
        <select name="activo" value={form.activo} onChange={handleChange} className="form-select">
          <option value={1}>Sí</option>
          <option value={0}>No</option>
        </select>
      </div>
      <div className="d-flex gap-2 justify-content-end">
        <button type="button" onClick={onCancel} className="btn btn-secondary">Cancelar</button>
        <button type="submit" className="btn btn-primary">Guardar</button>
      </div>
    </form>
  );
}

function UsuariosPage() {
  const [usuarios, setUsuarios] = useState([]);
  const [editando, setEditando] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const fetchUsuarios = async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api_usuarios.php");
      setUsuarios(await res.json());
    } catch {
      setError("Error al cargar usuarios");
    }
    setLoading(false);
  };

  useEffect(() => { fetchUsuarios(); }, []);

  const handleSave = async (data) => {
    setLoading(true);
    setError("");
    try {
      const method = editando ? "PUT" : "POST";
      const body = editando ? { ...data, id: editando.id } : data;
      await fetch("/api_usuarios.php", {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
      });
      setShowForm(false);
      setEditando(null);
      fetchUsuarios();
    } catch {
      setError("Error al guardar usuario");
    }
    setLoading(false);
  };

  const handleDelete = async (id) => {
    if (!window.confirm("¿Eliminar usuario?")) return;
    setLoading(true);
    setError("");
    try {
      await fetch("/api_usuarios.php", {
        method: "DELETE",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: `id=${id}`
      });
      fetchUsuarios();
    } catch {
      setError("Error al eliminar usuario");
    }
    setLoading(false);
  };
  
  return (
    <div className="container py-4">
      <h2 className="mb-4 text-2xl font-bold text-purple-800">Gestión de Usuarios</h2>
      <UsuarioList />
    </div>
  );
}

export default UsuariosPage;

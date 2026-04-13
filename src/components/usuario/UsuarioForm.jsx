import { useRef, useState } from "react";
import { RECEPCION_PERMISOS, RECEPCION_PERMISOS_LEGACY, normalizePermisos } from "../../config/recepcionPermisos";

const roles = [
  "administrador",
  "enfermero",
  "recepcionista",
  "laboratorista",
  "quimico"
];


function UsuarioForm({ initialData = {}, onSubmit, onCancel, loading }) {
  const esEdicion = !!initialData.id;
  const permisosNormalizados = normalizePermisos(initialData.permisos || []);
  const usaCompatLegadoRecepcion =
    esEdicion &&
    initialData.rol === "recepcionista" &&
    permisosNormalizados.length === 0;
  const permisosIniciales = usaCompatLegadoRecepcion
    ? RECEPCION_PERMISOS_LEGACY
    : permisosNormalizados;
  const fileInputRef = useRef(null);
  const [form, setForm] = useState({
    usuario: initialData.usuario || "",
    nombre: initialData.nombre || "",
    dni: initialData.dni || "",
    profesion: initialData.profesion || "",
    cargo_firma: initialData.cargo_firma || "",
    colegiatura_tipo: initialData.colegiatura_tipo || "",
    colegiatura_numero: initialData.colegiatura_numero || "",
    firma_reportes: initialData.firma_reportes || "",
    rol: initialData.rol || "recepcionista",
    permisos: permisosIniciales,
    activo: initialData.activo !== undefined ? initialData.activo : 1,
    password: ""
  });
  const [previewFirma, setPreviewFirma] = useState(initialData.firma_reportes || "");
  const [error, setError] = useState("");

  const handleChange = e => {
    const { name, value, type, checked } = e.target;
    setForm(f => ({
      ...f,
      [name]: name === "rol"
        ? value
        : (type === "checkbox" ? (checked ? 1 : 0) : value),
      permisos: name === "rol" && value !== "recepcionista" ? [] : f.permisos
    }));
  };

  const togglePermiso = (permiso) => {
    setForm((prev) => {
      const exists = prev.permisos.includes(permiso);
      return {
        ...prev,
        permisos: exists
          ? prev.permisos.filter((p) => p !== permiso)
          : [...prev.permisos, permiso]
      };
    });
  };

  const handleSubmit = e => {
    e.preventDefault();
    if (!form.usuario || !form.nombre || !form.dni || !form.rol) {
      setError("Usuario, nombre, DNI y rol son obligatorios");
      return;
    }
    if (!esEdicion && !form.password) {
      setError("La contraseña es obligatoria al crear usuario");
      return;
    }
    if (form.rol === "recepcionista" && (!Array.isArray(form.permisos) || form.permisos.length === 0)) {
      setError("Selecciona al menos un privilegio para la recepcionista");
      return;
    }
    setError("");
    onSubmit(form);
  };

  const handleFirmaFile = (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;

    if (!file.type.match(/^image\/(png|jpeg|jpg)$/)) {
      setError("La firma debe ser PNG, JPG o JPEG");
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      setError("La firma no debe superar 2MB");
      return;
    }

    const reader = new FileReader();
    reader.onload = (ev) => {
      const dataUrl = String(ev.target?.result || "");
      setForm((prev) => ({ ...prev, firma_reportes: dataUrl }));
      setPreviewFirma(dataUrl);
      setError("");
    };
    reader.readAsDataURL(file);
  };

  const quitarFirma = () => {
    setForm((prev) => ({ ...prev, firma_reportes: "" }));
    setPreviewFirma("");
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  return (
    <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-2 gap-3 p-4">
      <input name="usuario" value={form.usuario} onChange={handleChange} placeholder="Usuario" className="border rounded px-2 py-1" required />
      <input name="nombre" value={form.nombre} onChange={handleChange} placeholder="Nombre completo" className="border rounded px-2 py-1" required />
      <input name="dni" value={form.dni} onChange={handleChange} placeholder="DNI" className="border rounded px-2 py-1" required />
      <input name="profesion" value={form.profesion} onChange={handleChange} placeholder="Profesión" className="border rounded px-2 py-1" />
      <input name="cargo_firma" value={form.cargo_firma} onChange={handleChange} placeholder="Cargo para firma (ej: Tecnólogo Médico)" className="border rounded px-2 py-1" />
      <input name="colegiatura_tipo" value={form.colegiatura_tipo} onChange={handleChange} placeholder="Tipo colegiatura (ej: CTMP)" className="border rounded px-2 py-1" />
      <input name="colegiatura_numero" value={form.colegiatura_numero} onChange={handleChange} placeholder="N° colegiatura" className="border rounded px-2 py-1" />
      <select name="rol" value={form.rol} onChange={handleChange} className="border rounded px-2 py-1" required>
        {roles.map(r => <option key={r} value={r}>{r.charAt(0).toUpperCase() + r.slice(1)}</option>)}
      </select>
      <label className="flex items-center gap-2">
        <input type="checkbox" name="activo" checked={!!form.activo} onChange={handleChange} /> Activo
      </label>
      <input
        name="password"
        value={form.password}
        onChange={handleChange}
        placeholder="Contraseña"
        type="password"
        className="border rounded px-2 py-1 md:col-span-2"
        autoComplete="new-password"
        required={!esEdicion}
      />
      {esEdicion && (
        <div className="text-xs text-gray-500 md:col-span-2">Deja la contraseña vacía para no cambiarla.</div>
      )}
      {form.rol === "administrador" && (
        <div className="md:col-span-2 border rounded p-3 bg-green-50">
          <div className="text-sm font-semibold text-green-800 mb-1">✅ Acceso completo</div>
          <div className="text-xs text-green-700">
            El administrador tiene acceso a todos los módulos y vistas del sistema. No requiere configuración de privilegios.
          </div>
        </div>
      )}
      {form.rol === "recepcionista" && (
        <div className="md:col-span-2 border rounded p-3 bg-blue-50">
          <div className="text-sm font-semibold mb-2">Privilegios de recepcionista</div>
          {usaCompatLegadoRecepcion && (
            <div className="mb-2 text-xs text-blue-700">
              Usuario registrado antes de la nueva logica: se marcaron los accesos legacy que reflejan su panel actual.
            </div>
          )}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            {RECEPCION_PERMISOS.map((permiso) => (
              <label key={permiso.key} className="flex items-center gap-2 text-sm text-gray-700">
                <input
                  type="checkbox"
                  checked={form.permisos.includes(permiso.key)}
                  onChange={() => togglePermiso(permiso.key)}
                />
                {permiso.label}
              </label>
            ))}
          </div>
          <div className="mt-2 text-xs text-gray-600">
            Solo podra ver en sidebar y abrir rutas de los modulos marcados.
          </div>
        </div>
      )}
      <div className="md:col-span-2 border rounded p-3 bg-gray-50">
        <div className="text-sm font-semibold mb-2">Firma para reportes (opcional)</div>
        <div className="flex flex-wrap items-center gap-2">
          <input ref={fileInputRef} type="file" accept="image/png,image/jpeg,image/jpg" onChange={handleFirmaFile} className="text-sm" />
          <button type="button" onClick={quitarFirma} className="bg-red-100 text-red-700 rounded px-2 py-1 text-sm">Quitar</button>
        </div>
        {previewFirma ? (
          <img src={previewFirma} alt="Firma" className="mt-2 max-h-20 object-contain" />
        ) : (
          <div className="mt-2 text-xs text-gray-500">Sin firma cargada</div>
        )}
      </div>
      {error && <div className="text-red-600 md:col-span-2">{error}</div>}
      <div className="flex gap-2 md:col-span-2">
        <button type="submit" className="bg-blue-600 text-white rounded px-4 py-2 font-bold" disabled={loading}>
          {esEdicion ? "Actualizar" : "Guardar"}
        </button>
        <button type="button" className="bg-gray-300 text-gray-800 rounded px-4 py-2 font-bold" onClick={onCancel}>Cancelar</button>
      </div>
    </form>
  );
}

export default UsuarioForm;

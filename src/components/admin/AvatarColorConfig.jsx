import { useState, useEffect } from 'react';
import { BASE_URL } from '../../config/config.js';

function AvatarColorConfig() {
  const [avatares, setAvatares] = useState([]);
  const [colorPrimario, setColorPrimario] = useState('#3B82F6');
  const [loading, setLoading] = useState(false);
  const [mensaje, setMensaje] = useState('');
  const [error, setError] = useState('');
  const [uploadando, setUploadando] = useState(false);

  // Cargar configuración inicial
  useEffect(() => {
    cargarConfiguracion();
  }, []);

  const cargarConfiguracion = async () => {
    try {
      setLoading(true);
      const res = await fetch(`${BASE_URL}api_configuracion_apariencia.php`, {
        credentials: 'include',
      });
      const data = await res.json();
      if (data.success) {
        setAvatares(data.data.avatares || []);
        setColorPrimario(data.data.color_primario || '#3B82F6');
      }
    } catch (err) {
      setError('Error al cargar configuración: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleActivarAvatar = async (avatarId) => {
    try {
      setLoading(true);
      const formData = new FormData();
      formData.append('action', 'activate_avatar');
      formData.append('avatar_id', avatarId);

      const res = await fetch(`${BASE_URL}api_configuracion_apariencia.php`, {
        method: 'POST',
        credentials: 'include',
        body: formData,
      });
      const data = await res.json();
      if (data.success) {
        setMensaje('Avatar activado exitosamente');
        await cargarConfiguracion();
        setTimeout(() => setMensaje(''), 3000);
      } else {
        setError(data.error || 'Error al activar avatar');
      }
    } catch (err) {
      setError('Error: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleCambiarColor = async (nuevoColor) => {
    try {
      setLoading(true);
      const formData = new FormData();
      formData.append('action', 'update_color');
      formData.append('color', nuevoColor);

      const res = await fetch(`${BASE_URL}api_configuracion_apariencia.php`, {
        method: 'POST',
        credentials: 'include',
        body: formData,
      });
      const data = await res.json();
      if (data.success) {
        setColorPrimario(nuevoColor);
        setMensaje('Color actualizado exitosamente');
        setTimeout(() => setMensaje(''), 3000);
      } else {
        setError(data.error || 'Error al cambiar color');
      }
    } catch (err) {
      setError('Error: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleSubirAvatar = async (e, clave) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validar tamaño (máx 5MB)
    const MAX_SIZE = 5 * 1024 * 1024;
    if (file.size > MAX_SIZE) {
      setError(`Archivo demasiado grande. Máximo 5MB. Tu archivo: ${(file.size / 1024 / 1024).toFixed(2)}MB`);
      setTimeout(() => setError(''), 4000);
      return;
    }

    // Validar tipo
    const validTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
    if (!validTypes.includes(file.type)) {
      setError(`Tipo de archivo no válido. Acepta: JPG, PNG, WebP, GIF. Tu archivo: ${file.type}`);
      setTimeout(() => setError(''), 4000);
      return;
    }

    try {
      setUploadando(true);
      setError('');
      const formData = new FormData();
      formData.append('avatar', file);
      formData.append('avatar_clave', clave);

      const res = await fetch(`${BASE_URL}api_configuracion_apariencia.php`, {
        method: 'POST',
        credentials: 'include',
        body: formData,
      });
      const data = await res.json();
      if (data.success) {
        setMensaje('Avatar subido exitosamente');
        await cargarConfiguracion();
        setTimeout(() => setMensaje(''), 3000);
      } else {
        setError(data.error || 'Error al subir avatar');
      }
    } catch (err) {
      setError('Error de conexión: ' + err.message);
    } finally {
      setUploadando(false);
    }
  };

  return (
    <section className="mt-8 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <header className="mb-6">
        <h3 className="text-lg font-semibold text-slate-800">⚙️ Configuración de Avatar y Colores</h3>
        <p className="text-sm text-slate-600 mt-1">Personaliza el asistente y los colores del sistema</p>
      </header>

      {mensaje && (
        <div className="mb-4 rounded-lg bg-green-100 p-4 text-sm text-green-700 border border-green-300">✓ {mensaje}</div>
      )}
      {error && (
        <div className="mb-4 rounded-lg bg-red-100 p-4 text-sm text-red-700 border border-red-300 max-h-32 overflow-y-auto">
          <p className="font-semibold mb-1">❌ Error:</p>
          <p className="font-mono text-xs break-words whitespace-pre-wrap">{error}</p>
        </div>
      )}

      {/* Sección de Color */}
      <div className="mb-6 rounded-xl border border-slate-100 bg-slate-50 p-4">
        <h4 className="mb-3 font-semibold text-slate-800">Color Primario</h4>
        <div className="flex items-center gap-4">
          <input
            type="color"
            value={colorPrimario}
            onChange={(e) => handleCambiarColor(e.target.value)}
            disabled={loading}
            className="h-12 w-20 cursor-pointer rounded-lg border border-slate-300"
          />
          <div className="flex-1">
            <p className="text-sm font-mono text-slate-700">{colorPrimario}</p>
            <p className="text-xs text-slate-500">Haz clic para cambiar el color principal del sistema</p>
          </div>
        </div>
      </div>

      {/* Sección de Avatares */}
      <div className="rounded-xl border border-slate-100 bg-slate-50 p-4">
        <h4 className="mb-4 font-semibold text-slate-800">Avatares Disponibles</h4>

        {loading && !uploadando ? (
          <div className="py-4 text-center text-slate-600">Cargando...</div>
        ) : avatares.length === 0 ? (
          <div className="py-4 text-center text-slate-500">No hay avatares configurados</div>
        ) : (
          <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
            {avatares.map((avatar) => (
              <div
                key={avatar.id}
                className={`rounded-lg border p-4 transition-all ${
                  avatar.activo
                    ? 'border-green-400 bg-green-50 shadow-md'
                    : 'border-slate-200 bg-white hover:border-slate-300'
                }`}
              >
                {avatar.valor && (
                  <img
                    src={`${BASE_URL}${avatar.valor}`}
                    alt={avatar.descripcion}
                    className="h-20 w-20 rounded-full mx-auto mb-2 object-cover border border-slate-200"
                    onError={(e) => {
                      e.currentTarget.style.display = 'none';
                    }}
                  />
                )}
                <p className="text-sm font-medium text-slate-800 text-center">
                  {avatar.clave === 'avatar_medico_defecto' && '👨‍⚕️ Médico'}
                  {avatar.clave === 'avatar_doctora_defecto' && '👩‍⚕️ Doctora'}
                  {avatar.clave === 'avatar_asistente_defecto' && '👤 Asistente'}
                  {!['avatar_medico_defecto', 'avatar_doctora_defecto', 'avatar_asistente_defecto'].includes(avatar.clave) && avatar.descripcion}
                </p>
                {avatar.activo && <p className="text-xs text-green-600 text-center mt-1">✓ Activo</p>}
                <button
                  onClick={() => handleActivarAvatar(avatar.id)}
                  disabled={loading || avatar.activo}
                  className={`w-full mt-2 px-3 py-2 rounded text-sm font-medium transition-all ${
                    avatar.activo
                      ? 'bg-green-100 text-green-700 cursor-default'
                      : 'bg-blue-500 text-white hover:bg-blue-600 active:scale-95'
                  } disabled:opacity-50`}
                >
                  {avatar.activo ? 'Activo' : 'Activar'}
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Subida de nuevos avatares */}
        <div className="mt-6 border-t border-slate-200 pt-4">
          <h5 className="mb-3 font-medium text-slate-800 text-sm">Subir Nuevo Avatar</h5>
          <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
            {['avatar_medico_defecto', 'avatar_doctora_defecto', 'avatar_asistente_defecto'].map((clave) => (
              <label
                key={clave}
                className="cursor-pointer rounded-lg border-2 border-dashed border-slate-300 p-4 text-center transition-all hover:border-blue-400 hover:bg-blue-50"
              >
                <input
                  type="file"
                  accept="image/*"
                  onChange={(e) => handleSubirAvatar(e, clave)}
                  disabled={uploadando}
                  className="hidden"
                />
                <div className="text-sm text-slate-600">
                  <span className="block font-medium">
                    {clave === 'avatar_medico_defecto' && '👨‍⚕️ Médico'}
                    {clave === 'avatar_doctora_defecto' && '👩‍⚕️ Doctora'}
                    {clave === 'avatar_asistente_defecto' && '👤 Asistente'}
                  </span>
                  <span className="block text-xs text-slate-500 mt-1">
                    {uploadando ? 'Subiendo...' : 'Click para subir'}
                  </span>
                </div>
              </label>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

export default AvatarColorConfig;

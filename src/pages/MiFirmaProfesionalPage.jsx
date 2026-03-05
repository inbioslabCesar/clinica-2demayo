import { useEffect, useRef, useState } from "react";
import Swal from "sweetalert2";
import { BASE_URL } from "../config/config";

export default function MiFirmaProfesionalPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    nombre: "",
    rol: "",
    profesion: "",
    cargo_firma: "",
    colegiatura_tipo: "",
    colegiatura_numero: "",
    firma_reportes: "",
  });
  const [previewFirma, setPreviewFirma] = useState("");
  const [logoLaboratorio, setLogoLaboratorio] = useState("");
  const [logoPreviewTemp, setLogoPreviewTemp] = useState("");
  const [logoFile, setLogoFile] = useState(null);
  const [logoSaving, setLogoSaving] = useState(false);
  const inputFileRef = useRef(null);
  const inputLogoRef = useRef(null);

  const rolNormalizado = String(form.rol || "")
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
  const mostrarSeccionLogoLab = rolNormalizado === 'laboratorista';

  const resolveLogoPreviewUrl = (value) => {
    const raw = String(value || '').trim();
    if (!raw) return '';
    if (/^(https?:\/\/|data:|blob:)/i.test(raw)) return raw;
    const base = String(BASE_URL || '').replace(/\/+$/, '');
    return `${base}/${raw.replace(/^\/+/, '')}`;
  };

  const cargar = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${BASE_URL}api_mi_firma_profesional.php`, {
        credentials: "include",
      });
      const data = await res.json();
      if (!data?.success) throw new Error(data?.error || "No se pudo cargar");
      const d = data.data || {};
      setForm({
        nombre: d.nombre || "",
        rol: d.rol || "",
        profesion: d.profesion || "",
        cargo_firma: d.cargo_firma || "",
        colegiatura_tipo: d.colegiatura_tipo || "",
        colegiatura_numero: d.colegiatura_numero || "",
        firma_reportes: d.firma_reportes || "",
      });
      setPreviewFirma(d.firma_reportes || "");
    } catch (error) {
      Swal.fire("Error", error?.message || "No se pudo cargar la configuración", "error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    cargar();
  }, []);

  useEffect(() => {
    if (!mostrarSeccionLogoLab) return;
    fetch(`${BASE_URL}api_logo_laboratorio.php`, { credentials: "include" })
      .then((res) => res.json())
      .then((data) => {
        if (data?.success) {
          setLogoLaboratorio(String(data.logo_url || ""));
        }
      })
      .catch(() => {});
  }, [mostrarSeccionLogoLab]);

  useEffect(() => {
    return () => {
      if (logoPreviewTemp && logoPreviewTemp.startsWith('blob:')) {
        URL.revokeObjectURL(logoPreviewTemp);
      }
    };
  }, [logoPreviewTemp]);

  const onChange = (e) => {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const onSelectFirma = (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;

    if (!file.type.match(/^image\/(png|jpeg|jpg)$/)) {
      Swal.fire("Formato inválido", "Solo PNG, JPG o JPEG", "warning");
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      Swal.fire("Archivo grande", "Máximo 2MB", "warning");
      return;
    }

    const reader = new FileReader();
    reader.onload = (ev) => {
      const dataUrl = String(ev.target?.result || "");
      setForm((prev) => ({ ...prev, firma_reportes: dataUrl }));
      setPreviewFirma(dataUrl);
    };
    reader.readAsDataURL(file);
  };

  const guardar = async () => {
    setSaving(true);
    try {
      const res = await fetch(`${BASE_URL}api_mi_firma_profesional.php`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          profesion: form.profesion,
          cargo_firma: form.cargo_firma,
          colegiatura_tipo: form.colegiatura_tipo,
          colegiatura_numero: form.colegiatura_numero,
          firma_reportes: form.firma_reportes || null,
        }),
      });
      const data = await res.json();
      if (!data?.success) throw new Error(data?.error || "No se pudo guardar");
      Swal.fire("Listo", "Firma profesional actualizada", "success");
      cargar();
    } catch (error) {
      Swal.fire("Error", error?.message || "No se pudo guardar", "error");
    } finally {
      setSaving(false);
    }
  };

  const eliminarFirma = async () => {
    const r = await Swal.fire({
      title: "¿Eliminar firma?",
      text: "Se quitará la firma de tus reportes",
      icon: "warning",
      showCancelButton: true,
      confirmButtonText: "Eliminar",
      cancelButtonText: "Cancelar",
    });
    if (!r.isConfirmed) return;

    try {
      const res = await fetch(`${BASE_URL}api_mi_firma_profesional.php`, {
        method: "DELETE",
        credentials: "include",
      });
      const data = await res.json();
      if (!data?.success) throw new Error(data?.error || "No se pudo eliminar");
      setForm((prev) => ({ ...prev, firma_reportes: "" }));
      setPreviewFirma("");
      if (inputFileRef.current) inputFileRef.current.value = "";
      Swal.fire("Listo", "Firma eliminada", "success");
    } catch (error) {
      Swal.fire("Error", error?.message || "No se pudo eliminar", "error");
    }
  };

  const subirArchivoLogo = async (file) => {
    const formData = new FormData();
    formData.append('logo', file);
    const response = await fetch(`${BASE_URL}api_upload_logo.php`, {
      method: 'POST',
      credentials: 'include',
      body: formData
    });
    const result = await response.json();
    if (!(response.ok && result.success && result.path)) {
      throw new Error(result.error || 'No se pudo subir el logo');
    }
    return String(result.path);
  };

  const guardarLogoLaboratorio = async () => {
    setLogoSaving(true);
    try {
      let logoPath = logoLaboratorio;
      if (logoFile) {
        logoPath = await subirArchivoLogo(logoFile);
      }

      const response = await fetch(`${BASE_URL}api_logo_laboratorio.php`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ logo_url: logoPath })
      });
      const result = await response.json();
      if (!(response.ok && result.success)) {
        throw new Error(result.error || 'No se pudo guardar el logo');
      }

      setLogoLaboratorio(String(result.logo_url || logoPath || ''));
      setLogoFile(null);
      if (logoPreviewTemp && logoPreviewTemp.startsWith('blob:')) {
        URL.revokeObjectURL(logoPreviewTemp);
      }
      setLogoPreviewTemp('');
      if (inputLogoRef.current) inputLogoRef.current.value = '';
      Swal.fire('Listo', 'Logo de laboratorio actualizado', 'success');
    } catch (error) {
      Swal.fire('Error', error?.message || 'No se pudo guardar el logo', 'error');
    } finally {
      setLogoSaving(false);
    }
  };

  const quitarLogoLaboratorio = async () => {
    const confirm = await Swal.fire({
      title: '¿Quitar logo?',
      text: 'Se quitará el logo usado en reportes de laboratorio',
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'Quitar',
      cancelButtonText: 'Cancelar',
    });
    if (!confirm.isConfirmed) return;

    setLogoSaving(true);
    try {
      const response = await fetch(`${BASE_URL}api_logo_laboratorio.php`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ logo_url: '' })
      });
      const result = await response.json();
      if (!(response.ok && result.success)) {
        throw new Error(result.error || 'No se pudo quitar el logo');
      }

      if (logoPreviewTemp && logoPreviewTemp.startsWith('blob:')) {
        URL.revokeObjectURL(logoPreviewTemp);
      }
      setLogoLaboratorio('');
      setLogoFile(null);
      setLogoPreviewTemp('');
      if (inputLogoRef.current) inputLogoRef.current.value = '';
      Swal.fire('Listo', 'Logo de laboratorio eliminado', 'success');
    } catch (error) {
      Swal.fire('Error', error?.message || 'No se pudo quitar el logo', 'error');
    } finally {
      setLogoSaving(false);
    }
  };

  if (loading) {
    return <div className="p-6">Cargando...</div>;
  }

  return (
    <div className="max-w-4xl mx-auto p-4 md:p-8">
      <div className="bg-white rounded-xl shadow border border-gray-200 p-4 md:p-6 space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-purple-800">Mi firma profesional</h1>
          <p className="text-sm text-gray-600">Configura la firma y colegiatura para reportes institucionales.</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm text-gray-700 mb-1">Nombre</label>
            <input value={form.nombre} disabled className="w-full border rounded px-3 py-2 bg-gray-100" />
          </div>
          <div>
            <label className="block text-sm text-gray-700 mb-1">Rol</label>
            <input value={form.rol} disabled className="w-full border rounded px-3 py-2 bg-gray-100" />
          </div>
          <div>
            <label className="block text-sm text-gray-700 mb-1">Profesión</label>
            <input name="profesion" value={form.profesion} onChange={onChange} className="w-full border rounded px-3 py-2" />
          </div>
          <div>
            <label className="block text-sm text-gray-700 mb-1">Cargo para firma</label>
            <input name="cargo_firma" value={form.cargo_firma} onChange={onChange} placeholder="Ej: Tecnólogo Médico" className="w-full border rounded px-3 py-2" />
          </div>
          <div>
            <label className="block text-sm text-gray-700 mb-1">Tipo colegiatura</label>
            <input name="colegiatura_tipo" value={form.colegiatura_tipo} onChange={onChange} placeholder="Ej: CTMP / CQFP" className="w-full border rounded px-3 py-2" />
          </div>
          <div>
            <label className="block text-sm text-gray-700 mb-1">Número colegiatura</label>
            <input name="colegiatura_numero" value={form.colegiatura_numero} onChange={onChange} className="w-full border rounded px-3 py-2" />
          </div>
        </div>

        <div>
          <label className="block text-sm text-gray-700 mb-2">Firma (PNG/JPG)</label>
          <div className="flex flex-wrap items-center gap-2">
            <input ref={inputFileRef} type="file" accept="image/png,image/jpeg,image/jpg" onChange={onSelectFirma} className="text-sm" />
            <button type="button" onClick={eliminarFirma} className="bg-red-100 text-red-700 px-3 py-2 rounded hover:bg-red-200">Quitar firma</button>
          </div>
          {previewFirma ? (
            <div className="mt-3 p-3 border rounded bg-gray-50 inline-block">
              <img src={previewFirma} alt="Firma" className="max-h-24 object-contain" />
            </div>
          ) : (
            <div className="mt-2 text-sm text-gray-500">Sin firma cargada.</div>
          )}
        </div>

        {mostrarSeccionLogoLab && (
          <div className="border-t pt-6">
            <div className="mb-3">
              <h2 className="text-lg font-semibold text-purple-800">Logo para reportes de laboratorio</h2>
              <p className="text-sm text-gray-600">Este logo se usará en los PDFs de resultados de laboratorio.</p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {resolveLogoPreviewUrl(logoPreviewTemp || logoLaboratorio) ? (
                <img
                  src={resolveLogoPreviewUrl(logoPreviewTemp || logoLaboratorio)}
                  alt="Logo laboratorio"
                  className="h-14 w-auto border rounded bg-white px-2 py-1"
                />
              ) : (
                <div className="h-14 px-3 border rounded bg-gray-50 text-sm text-gray-500 flex items-center">
                  Sin logo cargado
                </div>
              )}

              <input
                ref={inputLogoRef}
                type="file"
                accept="image/png,image/jpeg,image/jpg,image/webp"
                onChange={(e) => {
                  const file = (e.target.files && e.target.files[0]) || null;
                  setLogoFile(file);
                  if (logoPreviewTemp && logoPreviewTemp.startsWith('blob:')) {
                    URL.revokeObjectURL(logoPreviewTemp);
                  }
                  setLogoPreviewTemp(file ? URL.createObjectURL(file) : '');
                }}
                className="text-sm"
              />

              <button
                type="button"
                onClick={guardarLogoLaboratorio}
                disabled={logoSaving}
                className="bg-purple-600 text-white px-3 py-2 rounded hover:bg-purple-700 disabled:opacity-50"
              >
                {logoSaving ? 'Guardando...' : 'Guardar logo'}
              </button>

              <button
                type="button"
                onClick={quitarLogoLaboratorio}
                disabled={logoSaving}
                className="bg-red-100 text-red-700 px-3 py-2 rounded hover:bg-red-200 disabled:opacity-50"
              >
                Quitar logo
              </button>
            </div>
          </div>
        )}

        <div>
          <button type="button" disabled={saving} onClick={guardar} className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 disabled:opacity-50">
            {saving ? "Guardando..." : "Guardar configuración"}
          </button>
        </div>
      </div>
    </div>
  );
}

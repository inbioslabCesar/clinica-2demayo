import { useEffect, useMemo, useState } from "react";
import {
  actualizarEmpresaOcupacional,
  crearEmpresaOcupacional,
  listarUbigeoDepartamentos,
  listarUbigeoProvincias,
  listarUbigeoDistritos,
} from "../../api/ocupacionalApi";

const initialForm = {
  ruc: "",
  razon_social: "",
  nombre_comercial: "",
  actividad: "",
  direccion: "",
  departamento: "",
  provincia: "",
  distrito: "",
  telefono_1: "",
  telefono_2: "",
  contacto_1: "",
  contacto_2: "",
  correo_1: "",
  correo_2: "",
  rrhh_usuario: "",
  rrhh_password: "",
  doctor_usuario: "",
  doctor_password: "",
  formato_principal: "Anexo 7-C",
  formato_certificado: "Tipo A",
  observacion: "",
};

function validateEmpresa(form) {
  const errors = {};

  if (!/^[0-9]{11}$/.test(form.ruc.trim())) {
    errors.ruc = "El RUC debe tener 11 digitos numericos.";
  }

  if (!form.razon_social.trim()) {
    errors.razon_social = "La razon social es obligatoria.";
  }

  if (!form.actividad.trim()) {
    errors.actividad = "La actividad es obligatoria.";
  }

  if (!form.direccion.trim()) {
    errors.direccion = "La direccion es obligatoria.";
  }

  if (!form.departamento.trim()) {
    errors.departamento = "El departamento es obligatorio.";
  }

  if (!form.provincia.trim()) {
    errors.provincia = "La provincia es obligatoria.";
  }

  if (!form.distrito.trim()) {
    errors.distrito = "El distrito es obligatorio.";
  }

  if (!form.contacto_1.trim()) {
    errors.contacto_1 = "El contacto 1 es obligatorio.";
  }

  if (form.correo_1 && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.correo_1.trim())) {
    errors.correo_1 = "Ingrese un correo 1 valido.";
  }

  if (form.correo_2 && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.correo_2.trim())) {
    errors.correo_2 = "Ingrese un correo 2 valido.";
  }

  return errors;
}

export default function FormEmpresa({
  mode = "create",
  initialData = null,
  onCreated,
  onUpdated,
  onCancel,
}) {
  const [form, setForm] = useState(initialForm);
  const [errors, setErrors] = useState({});
  const [loading, setLoading] = useState(false);
  const [serverMessage, setServerMessage] = useState("");
  const [serverError, setServerError] = useState("");
  const [departamentos, setDepartamentos] = useState([]);
  const [provincias, setProvincias] = useState([]);
  const [distritos, setDistritos] = useState([]);
  const [departamentoId, setDepartamentoId] = useState("");
  const [provinciaId, setProvinciaId] = useState("");
  const [ubigeoError, setUbigeoError] = useState("");

  const isEditMode = mode === "edit";

  useEffect(() => {
    let cancelled = false;
    async function loadDepartamentos() {
      try {
        const data = await listarUbigeoDepartamentos();
        if (!cancelled) {
          setDepartamentos(Array.isArray(data) ? data : []);
          setUbigeoError("");
        }
      } catch (error) {
        if (!cancelled) {
          setUbigeoError(error.message || "No se pudo cargar ubigeo");
        }
      }
    }
    loadDepartamentos();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (isEditMode && initialData) {
      setForm({
        ruc: String(initialData.ruc || ""),
        razon_social: String(initialData.razon_social || ""),
        nombre_comercial: String(initialData.nombre_comercial || ""),
        actividad: String(initialData.actividad || ""),
        direccion: String(initialData.direccion || ""),
        departamento: String(initialData.departamento || ""),
        provincia: String(initialData.provincia || ""),
        distrito: String(initialData.distrito || ""),
        telefono_1: String(initialData.telefono_1 || initialData.telefono || ""),
        telefono_2: String(initialData.telefono_2 || ""),
        contacto_1: String(initialData.contacto_1 || ""),
        contacto_2: String(initialData.contacto_2 || ""),
        correo_1: String(initialData.correo_1 || initialData.correo || ""),
        correo_2: String(initialData.correo_2 || ""),
        rrhh_usuario: String(initialData.rrhh_usuario || ""),
        rrhh_password: String(initialData.rrhh_password || ""),
        doctor_usuario: String(initialData.doctor_usuario || ""),
        doctor_password: String(initialData.doctor_password || ""),
        formato_principal: String(initialData.formato_principal || "Anexo 7-C"),
        formato_certificado: String(initialData.formato_certificado || "Tipo A"),
        observacion: String(initialData.observacion || ""),
      });
      setDepartamentoId("");
      setProvinciaId("");
      setProvincias([]);
      setDistritos([]);
      setErrors({});
      setServerMessage("");
      setServerError("");
      return;
    }

    if (!isEditMode) {
      setForm(initialForm);
      setDepartamentoId("");
      setProvinciaId("");
      setProvincias([]);
      setDistritos([]);
      setErrors({});
      setServerMessage("");
      setServerError("");
    }
  }, [isEditMode, initialData]);

  const isValid = useMemo(() => Object.keys(validateEmpresa(form)).length === 0, [form]);

  const cargarProvincias = async (depId) => {
    if (!depId) {
      setProvincias([]);
      setProvinciaId("");
      setDistritos([]);
      return;
    }
    try {
      const data = await listarUbigeoProvincias(depId);
      setProvincias(Array.isArray(data) ? data : []);
      setUbigeoError("");
    } catch (error) {
      setProvincias([]);
      setUbigeoError(error.message || "No se pudo cargar provincias");
    }
  };

  const cargarDistritos = async (provId) => {
    if (!provId) {
      setDistritos([]);
      return;
    }
    try {
      const data = await listarUbigeoDistritos(provId);
      setDistritos(Array.isArray(data) ? data : []);
      setUbigeoError("");
    } catch (error) {
      setDistritos([]);
      setUbigeoError(error.message || "No se pudo cargar distritos");
    }
  };

  const onChange = (field) => (event) => {
    const value = event.target.value;
    setForm((prev) => ({ ...prev, [field]: value }));
    setServerMessage("");
    setServerError("");
  };

  const onDepartamentoChange = async (event) => {
    const depId = event.target.value;
    setDepartamentoId(depId);
    const dep = departamentos.find((item) => String(item.id) === String(depId));
    setForm((prev) => ({
      ...prev,
      departamento: dep?.nombre || "",
      provincia: "",
      distrito: "",
    }));
    setProvinciaId("");
    setDistritos([]);
    await cargarProvincias(depId);
  };

  const onProvinciaChange = async (event) => {
    const provId = event.target.value;
    setProvinciaId(provId);
    const prov = provincias.find((item) => String(item.id) === String(provId));
    setForm((prev) => ({ ...prev, provincia: prov?.nombre || "", distrito: "" }));
    await cargarDistritos(provId);
  };

  const onDistritoChange = (event) => {
    const distId = event.target.value;
    const dist = distritos.find((item) => String(item.id) === String(distId));
    setForm((prev) => ({ ...prev, distrito: dist?.nombre || "" }));
  };

  useEffect(() => {
    if (!departamentos.length || departamentoId || !form.departamento) return;
    const dep = departamentos.find(
      (item) => String(item.nombre || "").toUpperCase() === String(form.departamento || "").toUpperCase()
    );
    if (dep) {
      setDepartamentoId(String(dep.id));
      cargarProvincias(dep.id);
    }
  }, [departamentos, departamentoId, form.departamento]);

  useEffect(() => {
    if (!provincias.length || provinciaId || !form.provincia) return;
    const prov = provincias.find(
      (item) => String(item.nombre || "").toUpperCase() === String(form.provincia || "").toUpperCase()
    );
    if (prov) {
      setProvinciaId(String(prov.id));
      cargarDistritos(prov.id);
    }
  }, [provincias, provinciaId, form.provincia]);

  const onSubmit = async (event) => {
    event.preventDefault();
    const currentErrors = validateEmpresa(form);
    setErrors(currentErrors);
    if (Object.keys(currentErrors).length > 0) {
      return;
    }

    setLoading(true);
    setServerMessage("");
    setServerError("");

    try {
      const payload = {
        ruc: form.ruc.trim(),
        razon_social: form.razon_social.trim(),
        nombre_comercial: form.nombre_comercial.trim(),
        actividad: form.actividad.trim(),
        direccion: form.direccion.trim(),
        departamento: form.departamento.trim(),
        provincia: form.provincia.trim(),
        distrito: form.distrito.trim(),
        telefono_1: form.telefono_1.trim(),
        telefono_2: form.telefono_2.trim(),
        contacto_1: form.contacto_1.trim(),
        contacto_2: form.contacto_2.trim(),
        correo_1: form.correo_1.trim(),
        correo_2: form.correo_2.trim(),
        rrhh_usuario: form.rrhh_usuario.trim(),
        rrhh_password: form.rrhh_password.trim(),
        doctor_usuario: form.doctor_usuario.trim(),
        doctor_password: form.doctor_password.trim(),
        formato_principal: form.formato_principal.trim(),
        formato_certificado: form.formato_certificado.trim(),
        observacion: form.observacion.trim(),
      };

      if (isEditMode) {
        await actualizarEmpresaOcupacional({
          id: Number(initialData?.id || 0),
          ...payload,
        });
        setServerMessage("Empresa actualizada correctamente.");
      } else {
        await crearEmpresaOcupacional(payload);
        setServerMessage("Empresa registrada correctamente.");
      }

      if (!isEditMode) {
        setForm(initialForm);
      }
      setErrors({});
      if (!isEditMode && typeof onCreated === "function") {
        onCreated();
      }
      if (isEditMode && typeof onUpdated === "function") {
        onUpdated();
      }
    } catch (error) {
      setServerError(error.message || `No se pudo ${isEditMode ? "actualizar" : "registrar"} la empresa.`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="w-full rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
      <h2 className="text-xl font-semibold text-slate-900">
        {isEditMode ? "Editar Empresa Ocupacional" : "Registro de Empresa Ocupacional"}
      </h2>
      <p className="mt-1 text-sm text-slate-600">
        {isEditMode
          ? "Actualice los datos de la empresa seleccionada."
          : "Complete los datos para crear una empresa en Salud Ocupacional."}
      </p>

      <form className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4" onSubmit={onSubmit}>
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">RUC *</label>
          <input
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-100"
            value={form.ruc}
            onChange={onChange("ruc")}
            maxLength={11}
            inputMode="numeric"
            placeholder="20123456789"
          />
          {errors.ruc ? <p className="mt-1 text-xs text-red-600">{errors.ruc}</p> : null}
        </div>

        <div className="md:col-span-1 xl:col-span-2">
          <label className="mb-1 block text-sm font-medium text-slate-700">Razon social *</label>
          <input
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-100"
            value={form.razon_social}
            onChange={onChange("razon_social")}
            placeholder="Empresa SAC"
          />
          {errors.razon_social ? <p className="mt-1 text-xs text-red-600">{errors.razon_social}</p> : null}
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">Nombre comercial</label>
          <input
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-100"
            value={form.nombre_comercial}
            onChange={onChange("nombre_comercial")}
            placeholder="Comercial SAC"
          />
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">Actividad *</label>
          <input
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-100"
            value={form.actividad}
            onChange={onChange("actividad")}
            placeholder="LABORATORIO"
          />
          {errors.actividad ? <p className="mt-1 text-xs text-red-600">{errors.actividad}</p> : null}
        </div>

        <div className="md:col-span-2 xl:col-span-2">
          <label className="mb-1 block text-sm font-medium text-slate-700">Direccion *</label>
          <input
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-100"
            value={form.direccion}
            onChange={onChange("direccion")}
            placeholder="Av. Principal 123"
          />
          {errors.direccion ? <p className="mt-1 text-xs text-red-600">{errors.direccion}</p> : null}
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">Departamento *</label>
          <select
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-100"
            value={departamentoId}
            onChange={onDepartamentoChange}
          >
            <option value="">Seleccione departamento</option>
            {departamentos.map((item) => (
              <option key={item.id} value={item.id}>{item.nombre}</option>
            ))}
          </select>
          {errors.departamento ? <p className="mt-1 text-xs text-red-600">{errors.departamento}</p> : null}
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">Provincia *</label>
          <select
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-100 disabled:bg-slate-100"
            value={provinciaId}
            onChange={onProvinciaChange}
            disabled={!departamentoId}
          >
            <option value="">Seleccione provincia</option>
            {provincias.map((item) => (
              <option key={item.id} value={item.id}>{item.nombre}</option>
            ))}
          </select>
          {errors.provincia ? <p className="mt-1 text-xs text-red-600">{errors.provincia}</p> : null}
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">Distrito *</label>
          <select
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-100 disabled:bg-slate-100"
            value={
              distritos.find((item) => String(item.nombre || "").toUpperCase() === String(form.distrito || "").toUpperCase())?.id || ""
            }
            onChange={onDistritoChange}
            disabled={!provinciaId}
          >
            <option value="">Seleccione distrito</option>
            {distritos.map((item) => (
              <option key={item.id} value={item.id}>{item.nombre}</option>
            ))}
          </select>
          {errors.distrito ? <p className="mt-1 text-xs text-red-600">{errors.distrito}</p> : null}
        </div>

        {ubigeoError ? (
          <div className="md:col-span-2 xl:col-span-4">
            <p className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-800">
              {ubigeoError}
            </p>
          </div>
        ) : null}

        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">Telefono 1</label>
          <input
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-100"
            value={form.telefono_1}
            onChange={onChange("telefono_1")}
            placeholder="999999999"
          />
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">Telefono 2</label>
          <input
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-100"
            value={form.telefono_2}
            onChange={onChange("telefono_2")}
            placeholder="988888888"
          />
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">Contacto 1 *</label>
          <input
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-100"
            value={form.contacto_1}
            onChange={onChange("contacto_1")}
            placeholder="Nombres Apellidos"
          />
          {errors.contacto_1 ? <p className="mt-1 text-xs text-red-600">{errors.contacto_1}</p> : null}
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">Contacto 2</label>
          <input
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-100"
            value={form.contacto_2}
            onChange={onChange("contacto_2")}
            placeholder="Nombres Apellidos"
          />
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">Email 1</label>
          <input
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-100"
            value={form.correo_1}
            onChange={onChange("correo_1")}
            placeholder="rrhh@empresa.com"
          />
          {errors.correo_1 ? <p className="mt-1 text-xs text-red-600">{errors.correo_1}</p> : null}
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">Email 2</label>
          <input
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-100"
            value={form.correo_2}
            onChange={onChange("correo_2")}
            placeholder="medico@empresa.com"
          />
          {errors.correo_2 ? <p className="mt-1 text-xs text-red-600">{errors.correo_2}</p> : null}
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">Usuario RRHH</label>
          <input
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-100"
            value={form.rrhh_usuario}
            onChange={onChange("rrhh_usuario")}
          />
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">Password RRHH</label>
          <input
            type="text"
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-100"
            value={form.rrhh_password}
            placeholder={initialData?.rrhh_password_definida && !initialData?.rrhh_password ? "Definida (vacío = conservar)" : ""}
            onChange={onChange("rrhh_password")}
          />
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">Usuario Doctor</label>
          <input
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-100"
            value={form.doctor_usuario}
            onChange={onChange("doctor_usuario")}
          />
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">Password Doctor</label>
          <input
            type="text"
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-100"
            value={form.doctor_password}
            placeholder={initialData?.doctor_password_definida && !initialData?.doctor_password ? "Definida (vacío = conservar)" : ""}
            onChange={onChange("doctor_password")}
          />
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">Formato principal</label>
          <select
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-100"
            value={form.formato_principal}
            onChange={onChange("formato_principal")}
          >
            <option value="Anexo 7-C">Anexo 7-C</option>
            <option value="312">312</option>
          </select>
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">Formato certificado</label>
          <select
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-100"
            value={form.formato_certificado}
            onChange={onChange("formato_certificado")}
          >
            <option value="Tipo A">Tipo A</option>
            <option value="Tipo B">Tipo B</option>
          </select>
        </div>

        <div className="md:col-span-2 xl:col-span-4">
          <label className="mb-1 block text-sm font-medium text-slate-700">Observacion</label>
          <textarea
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-100"
            value={form.observacion}
            onChange={onChange("observacion")}
            rows={3}
          />
        </div>

        {serverMessage ? <p className="md:col-span-2 xl:col-span-4 text-sm text-emerald-600">{serverMessage}</p> : null}
        {serverError ? <p className="md:col-span-2 xl:col-span-4 text-sm text-red-600">{serverError}</p> : null}

        <div className="md:col-span-2 xl:col-span-4 flex justify-end gap-2">
          {isEditMode ? (
            <button
              type="button"
              onClick={() => {
                setServerMessage("");
                setServerError("");
                if (typeof onCancel === "function") {
                  onCancel();
                }
              }}
              className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
            >
              Cancelar edición
            </button>
          ) : null}
          <button
            type="submit"
            disabled={!isValid || loading}
            className="rounded-md bg-teal-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-teal-700 disabled:cursor-not-allowed disabled:bg-slate-400"
          >
            {loading ? "Guardando..." : isEditMode ? "Guardar Cambios" : "Guardar Empresa"}
          </button>
        </div>
      </form>
    </div>
  );
}

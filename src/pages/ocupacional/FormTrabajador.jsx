import { useEffect, useMemo, useState } from "react";
import {
  listarCatalogosLaboralesEmpresa,
  listarEmpresasOcupacionales,
  registrarTrabajadorOcupacional,
  verificarIdentidadClinica,
} from "../../api/ocupacionalApi";
import { authFetch } from "../../utils/apiClient";
import PacienteListForm from "../../components/paciente-list/PacienteListForm";

const initialLaborData = {
  empresa_id: "",
  puesto_trabajo: "",
  area_riesgo: "",
  fecha_ingreso: "",
};

function validarDocumento(valor) {
  return /^[A-Za-z0-9]{6,15}$/.test((valor || "").trim());
}

function validarForm(identidad, laborData) {
  const errors = {};

  if (!identidad?.id) {
    errors.identidad = "Primero verifique la identidad del trabajador.";
  }
  if (!laborData.empresa_id) {
    errors.empresa_id = "Seleccione una empresa.";
  }
  if (!laborData.puesto_trabajo.trim()) {
    errors.puesto_trabajo = "El puesto de trabajo es obligatorio.";
  }
  if (!laborData.fecha_ingreso) {
    errors.fecha_ingreso = "La fecha de ingreso es obligatoria.";
  }

  return errors;
}

export default function FormTrabajador({ onCreated }) {
  const [documentoTipo, setDocumentoTipo] = useState("DNI");
  const [documentoNumero, setDocumentoNumero] = useState("");
  const [verificando, setVerificando] = useState(false);
  const [identidad, setIdentidad] = useState(null);
  const [identidadError, setIdentidadError] = useState("");

  const [empresas, setEmpresas] = useState([]);
  const [areas, setAreas] = useState([]);
  const [puestos, setPuestos] = useState([]);
  const [catalogosLoading, setCatalogosLoading] = useState(false);
  const [laborData, setLaborData] = useState(initialLaborData);
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const [serverMessage, setServerMessage] = useState("");
  const [serverError, setServerError] = useState("");
  const [showCrearPaciente, setShowCrearPaciente] = useState(false);
  const [modalPacienteOpen, setModalPacienteOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function loadEmpresas() {
      try {
        const data = await listarEmpresasOcupacionales({ estado: "activo" });
        if (!cancelled) {
          setEmpresas(data);
        }
      } catch (error) {
        if (!cancelled) {
          setServerError(error.message || "No se pudo cargar empresas.");
        }
      }
    }

    loadEmpresas();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    const empresaId = Number(laborData.empresa_id || 0);
    if (!empresaId) {
      setAreas([]);
      setPuestos([]);
      return undefined;
    }

    setCatalogosLoading(true);
    Promise.all([
      listarCatalogosLaboralesEmpresa({ empresaId, tipo: "area", estado: "activo" }),
      listarCatalogosLaboralesEmpresa({ empresaId, tipo: "puesto", estado: "activo" }),
    ])
      .then(([areasData, puestosData]) => {
        if (!cancelled) {
          setAreas(Array.isArray(areasData) ? areasData : []);
          setPuestos(Array.isArray(puestosData) ? puestosData : []);
        }
      })
      .catch((error) => {
        if (!cancelled) {
          setAreas([]);
          setPuestos([]);
          setServerError(error.message || "No se pudieron cargar áreas y puestos de la empresa.");
        }
      })
      .finally(() => {
        if (!cancelled) setCatalogosLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [laborData.empresa_id]);

  const canVerify = useMemo(() => validarDocumento(documentoNumero), [documentoNumero]);
  const canSubmit = useMemo(() => identidad?.id && !saving, [identidad, saving]);

  const mapDocumentoTipoPaciente = (tipo) => {
    const normalized = String(tipo || "").trim().toUpperCase();
    if (normalized === "DNI") return "dni";
    if (normalized === "CE") return "carnet_extranjeria";
    return "pasaporte";
  };

  const normalizarIdentidadDesdePaciente = (paciente) => ({
    id: Number(paciente?.id || 0),
    nombre: String(paciente?.nombre || "").trim(),
    apellido_paterno: String(paciente?.apellido || "").trim(),
    apellido_materno: "",
    apellidos: String(paciente?.apellido || "").trim(),
    sexo: String(paciente?.sexo || "").trim(),
    fecha_nacimiento: String(paciente?.fecha_nacimiento || "").trim(),
    documento_tipo: String(documentoTipo || "DNI").trim().toUpperCase(),
    documento_numero: String(paciente?.dni || documentoNumero || "").trim().toUpperCase(),
    tiene_firma_digital: false,
    tiene_huella_digital: false,
    tiene_fotografia: false,
  });

  const guardarPacienteCompleto = async (pacientePayload) => {
    try {
      const res = await authFetch("api_pacientes.php", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(pacientePayload),
      });
      const payload = await res.json().catch(() => null);
      if (!res.ok || !payload?.success || !payload?.paciente) {
        return { success: false, error: payload?.error || "No se pudo crear paciente clinico" };
      }
      return { success: true, paciente: payload.paciente };
    } catch {
      return { success: false, error: "Error de conexión al crear paciente" };
    }
  };

  const onPacienteRegistrado = (paciente) => {
    const identidadNueva = normalizarIdentidadDesdePaciente(paciente || {});
    if (!identidadNueva.id) {
      setIdentidadError("No se pudo enlazar el paciente creado al flujo ocupacional.");
      return;
    }
    setIdentidad(identidadNueva);
    setDocumentoNumero(String(identidadNueva.documento_numero || documentoNumero || "").toUpperCase());
    setModalPacienteOpen(false);
    setShowCrearPaciente(false);
    setServerMessage("Paciente clinico creado. Continúe con el registro laboral.");
    setIdentidadError("");
  };

  const onVerify = async () => {
    setIdentidad(null);
    setIdentidadError("");
    setServerError("");
    setServerMessage("");
    setShowCrearPaciente(false);

    if (!canVerify) {
      setIdentidadError("Documento invalido. Use formato alfanumerico de 6 a 15 caracteres.");
      return;
    }

    setVerificando(true);
    try {
      const data = await verificarIdentidadClinica({
        documentoTipo,
        documentoNumero: documentoNumero.trim().toUpperCase(),
      });
      setIdentidad(data);
    } catch (error) {
      const msg = error.message || "No se encontro identidad para el documento.";
      setIdentidadError(msg);
      if (msg.toLowerCase().includes("paciente no encontrado")) {
        setShowCrearPaciente(true);
      }
    } finally {
      setVerificando(false);
    }
  };

  const onLaborChange = (field) => (event) => {
    const value = event.target.value;
    setLaborData((prev) => field === "empresa_id"
      ? { ...prev, empresa_id: value, puesto_trabajo: "", area_riesgo: "" }
      : { ...prev, [field]: value });
    setServerError("");
    setServerMessage("");
  };

  const onSubmit = async (event) => {
    event.preventDefault();
    const currentErrors = validarForm(identidad, laborData);
    setErrors(currentErrors);
    if (Object.keys(currentErrors).length > 0) {
      return;
    }

    setSaving(true);
    setServerMessage("");
    setServerError("");

    try {
      const registered = await registrarTrabajadorOcupacional({
        empresa_id: Number(laborData.empresa_id),
        external_patient_id: Number(identidad.id),
        documento_tipo: identidad.documento_tipo || documentoTipo,
        documento_numero: (identidad.documento_numero || documentoNumero).toUpperCase(),
        puesto_trabajo: laborData.puesto_trabajo.trim(),
        area_riesgo: laborData.area_riesgo,
        fecha_ingreso: laborData.fecha_ingreso,
        estado_laboral: "activo",
      });

      setServerMessage("Trabajador registrado correctamente.");
      setLaborData(initialLaborData);
      setIdentidad(null);
      setDocumentoNumero("");
      setErrors({});
      if (typeof onCreated === "function") {
        onCreated(registered);
      }
    } catch (error) {
      setServerError(error.message || "No se pudo registrar el trabajador.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="w-full rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
      <h2 className="text-xl font-semibold text-slate-900">Registro de Trabajador Ocupacional</h2>
      <p className="mt-1 text-sm text-slate-600">Verifique identidad desde el sistema clinico y complete los datos laborales.</p>

      <div className="mt-6 grid grid-cols-1 gap-3 md:grid-cols-4">
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">Tipo documento</label>
          <select
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-cyan-500 focus:ring-2 focus:ring-cyan-100"
            value={documentoTipo}
            onChange={(event) => setDocumentoTipo(event.target.value)}
          >
            <option value="DNI">DNI</option>
            <option value="PASAPORTE">Pasaporte</option>
            <option value="CE">Carnet de Extranjeria</option>
          </select>
        </div>

        <div className="md:col-span-2">
          <label className="mb-1 block text-sm font-medium text-slate-700">Numero de documento</label>
          <input
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm uppercase outline-none focus:border-cyan-500 focus:ring-2 focus:ring-cyan-100"
            value={documentoNumero}
            onChange={(event) => setDocumentoNumero(event.target.value)}
            placeholder="Ingrese documento"
          />
        </div>

        <div className="flex items-end">
          <button
            type="button"
            onClick={onVerify}
            disabled={!canVerify || verificando}
            className="w-full rounded-md bg-cyan-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-cyan-700 disabled:cursor-not-allowed disabled:bg-slate-400"
          >
            {verificando ? "Verificando..." : "Verificar"}
          </button>
        </div>
      </div>

      {identidadError ? <p className="mt-2 text-sm text-red-600">{identidadError}</p> : null}

      {!identidad?.id && showCrearPaciente ? (
        <div className="mt-3 rounded-lg border border-amber-300 bg-amber-50 p-4">
          <h3 className="text-sm font-semibold text-amber-900">Paciente no encontrado</h3>
          <p className="mt-1 text-xs text-amber-800">Puede registrar el paciente con el formulario completo (todos los campos) sin salir de esta pantalla.</p>
          <div className="mt-3 flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setShowCrearPaciente(false)}
              className="rounded-md border border-amber-300 bg-white px-4 py-2 text-sm font-semibold text-amber-800 hover:bg-amber-100"
            >
              Cerrar
            </button>
            <button
              type="button"
              onClick={() => setModalPacienteOpen(true)}
              className="rounded-md bg-amber-600 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-700 disabled:cursor-not-allowed disabled:bg-slate-400"
            >
              Registrar paciente completo
            </button>
          </div>
        </div>
      ) : null}

      <div className="mt-6 grid grid-cols-1 gap-3 rounded-lg border border-slate-200 bg-slate-50 p-4 md:grid-cols-2">
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">Nombres</label>
          <input className="w-full rounded-md border border-slate-300 bg-slate-100 px-3 py-2 text-sm" value={identidad?.nombre || ""} readOnly />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">Apellidos</label>
          <input className="w-full rounded-md border border-slate-300 bg-slate-100 px-3 py-2 text-sm" value={identidad?.apellidos || ""} readOnly />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">Sexo</label>
          <input className="w-full rounded-md border border-slate-300 bg-slate-100 px-3 py-2 text-sm" value={identidad?.sexo || ""} readOnly />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">Fecha de nacimiento</label>
          <input className="w-full rounded-md border border-slate-300 bg-slate-100 px-3 py-2 text-sm" value={identidad?.fecha_nacimiento || ""} readOnly />
        </div>
      </div>

      <form className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2" onSubmit={onSubmit}>
        {errors.identidad ? <p className="md:col-span-2 text-sm text-red-600">{errors.identidad}</p> : null}

        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">Empresa *</label>
          <select
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-cyan-500 focus:ring-2 focus:ring-cyan-100"
            value={laborData.empresa_id}
            onChange={onLaborChange("empresa_id")}
            disabled={!identidad?.id}
          >
            <option value="">Seleccione empresa</option>
            {empresas.map((empresa) => (
              <option key={empresa.id} value={empresa.id}>
                {empresa.razon_social}
              </option>
            ))}
          </select>
          {errors.empresa_id ? <p className="mt-1 text-xs text-red-600">{errors.empresa_id}</p> : null}
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">Puesto de trabajo *</label>
          <select
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-cyan-500 focus:ring-2 focus:ring-cyan-100"
            value={laborData.puesto_trabajo}
            onChange={onLaborChange("puesto_trabajo")}
            disabled={!identidad?.id || !laborData.empresa_id || catalogosLoading}
          >
            <option value="">{catalogosLoading ? "Cargando puestos..." : "Seleccione puesto"}</option>
            {puestos.map((puesto) => <option key={puesto.id} value={puesto.nombre}>{puesto.nombre}</option>)}
          </select>
          {!catalogosLoading && laborData.empresa_id && puestos.length === 0 ? (
            <p className="mt-1 text-xs text-amber-700">Esta empresa no tiene puestos activos. Créelos desde Empresas &gt; Puesto.</p>
          ) : null}
          {errors.puesto_trabajo ? <p className="mt-1 text-xs text-red-600">{errors.puesto_trabajo}</p> : null}
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">Área</label>
          <select
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-cyan-500 focus:ring-2 focus:ring-cyan-100"
            value={laborData.area_riesgo}
            onChange={onLaborChange("area_riesgo")}
            disabled={!identidad?.id || !laborData.empresa_id || catalogosLoading}
          >
            <option value="">{catalogosLoading ? "Cargando áreas..." : "Seleccione área"}</option>
            {areas.map((area) => <option key={area.id} value={area.nombre}>{area.nombre}</option>)}
          </select>
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">Fecha de ingreso *</label>
          <input
            type="date"
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-cyan-500 focus:ring-2 focus:ring-cyan-100"
            value={laborData.fecha_ingreso}
            onChange={onLaborChange("fecha_ingreso")}
            disabled={!identidad?.id}
          />
          {errors.fecha_ingreso ? <p className="mt-1 text-xs text-red-600">{errors.fecha_ingreso}</p> : null}
        </div>

        {serverMessage ? <p className="md:col-span-2 text-sm text-emerald-600">{serverMessage}</p> : null}
        {serverError ? <p className="md:col-span-2 text-sm text-red-600">{serverError}</p> : null}

        <div className="md:col-span-2 flex justify-end">
          <button
            type="submit"
            disabled={!canSubmit}
            className="rounded-md bg-cyan-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-cyan-700 disabled:cursor-not-allowed disabled:bg-slate-400"
          >
            {saving ? "Guardando..." : "Registrar trabajador"}
          </button>
        </div>
      </form>

      {modalPacienteOpen ? (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-2 sm:p-4" role="dialog" aria-modal="true">
          <div className="relative w-full max-w-5xl rounded-xl bg-white shadow-2xl">
            <button
              type="button"
              onClick={() => setModalPacienteOpen(false)}
              className="absolute right-3 top-2 z-10 rounded-md px-2 py-1 text-xl font-bold text-slate-500 hover:bg-slate-100"
              aria-label="Cerrar registro de paciente"
            >
              ×
            </button>
            <PacienteListForm
              initialData={{
                tipo_documento: mapDocumentoTipoPaciente(documentoTipo),
                dni: String(documentoNumero || "").trim().toUpperCase(),
                procedencia: "OCUPACIONAL",
                tipo_seguro: "PARTICULAR",
              }}
              guardarPaciente={guardarPacienteCompleto}
              onRegistroExitoso={onPacienteRegistrado}
            />
          </div>
        </div>
      ) : null}
    </div>
  );
}


import React, { useState } from "react";
import { BASE_URL } from "../config/config";
import Swal from "sweetalert2";
import withReactContent from "sweetalert2-react-content";
import DatosBasicos from "./paciente/DatosBasicos";
import DatosEdad from "./paciente/DatosEdad";
import DatosAdicionales from "./paciente/DatosAdicionales";
import DatosContacto from "./paciente/DatosContacto";

function PacienteForm({ initialData = {}, onRegistroExitoso }) {
  const MySwal = withReactContent(Swal);
  const [form, setForm] = useState({
    id: initialData.id || undefined,
    dni: initialData.dni || "",
    tipo_documento: initialData.tipo_documento || "dni", // nuevo campo
    nombre: initialData.nombre || "",
    apellido: initialData.apellido || "",
    historia_clinica: initialData.historia_clinica || "",
    fecha_nacimiento: initialData.fecha_nacimiento || "",
    edad: initialData.edad || "",
    edad_unidad: initialData.edad_unidad || "años",
    procedencia: initialData.procedencia || "",
    tipo_seguro: initialData.tipo_seguro || "",
    sexo: initialData.sexo || "M",
    direccion: initialData.direccion || "",
    telefono: initialData.telefono || "",
    email: initialData.email || "",
  });

  React.useEffect(() => {
    setForm({
      id: initialData.id || undefined,
      dni: initialData.dni || "",
      tipo_documento: initialData.tipo_documento || "dni",
      nombre: initialData.nombre || "",
      apellido: initialData.apellido || "",
      historia_clinica: initialData.historia_clinica || "",
      fecha_nacimiento: initialData.fecha_nacimiento || "",
      edad: initialData.edad || "",
      edad_unidad: initialData.edad_unidad || "años",
      procedencia: initialData.procedencia || "",
      tipo_seguro: initialData.tipo_seguro || "",
      sexo: initialData.sexo || "M",
      direccion: initialData.direccion || "",
      telefono: initialData.telefono || "",
      email: initialData.email || "",
    });
  }, [initialData]);
  const [error, setError] = useState("");
  // Validación en tiempo real para edad máxima
  React.useEffect(() => {
    if (form.edad_unidad === "años" && form.edad && Number(form.edad) > 150) {
      setError("La edad no puede superar los 150 años.");
    } else {
      setError("");
    }
  }, [form.edad, form.edad_unidad]);
  const [loading, setLoading] = useState(false);

  const handleChange = (e) => {
    const { name, value } = e.target;
    if (name === "tipo_documento") {
      // Si cambia el tipo de documento y es "sin_documento", limpiar el campo dni
      setForm({
        ...form,
        tipo_documento: value,
        dni: value === "sin_documento" ? "" : form.dni,
      });
      return;
    }
    if (name === "dni" && form.tipo_documento === "sin_documento") {
      // No permitir edición manual si es sin documento
      return;
    }
    if (name === "fecha_nacimiento" && value) {
      const hoy = new Date();
      const fechaNac = new Date(value);
      let edad = "";
      let unidad = "años";
      // Calcular diferencia en milisegundos
      const diffMs = hoy - fechaNac;
      const diffDias = Math.floor(diffMs / (1000 * 60 * 60 * 24));
      if (diffDias < 0) {
        edad = "";
      } else if (diffDias < 31) {
        edad = diffDias;
        unidad = "días";
      } else if (diffDias < 365) {
        // Calcular meses
        const diffMeses =
          (hoy.getFullYear() - fechaNac.getFullYear()) * 12 +
          hoy.getMonth() -
          fechaNac.getMonth();
        edad = diffMeses;
        unidad = "meses";
      } else {
        // Calcular años
        let diffAnios = hoy.getFullYear() - fechaNac.getFullYear();
        const m = hoy.getMonth() - fechaNac.getMonth();
        if (m < 0 || (m === 0 && hoy.getDate() < fechaNac.getDate())) {
          diffAnios--;
        }
        edad = diffAnios;
        unidad = "años";
      }
      setForm({
        ...form,
        fecha_nacimiento: value,
        edad: edad,
        edad_unidad: unidad,
      });
    } else {
      setForm({ ...form, [name]: value });
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    let formToSend = { ...form };
    // Convertir a mayúsculas los campos de texto relevantes
    const camposMayuscula = [
      "nombre",
      "apellido",
      "historia_clinica",
      "procedencia",
      "direccion",
      "tipo_seguro"
    ];
    camposMayuscula.forEach((campo) => {
      if (formToSend[campo]) {
        formToSend[campo] = formToSend[campo].toUpperCase();
      }
    });
    // El email se mantiene en minúscula
    if (formToSend.email) {
      formToSend.email = formToSend.email.trim();
    }
    // Validar según tipo de documento
    if (formToSend.tipo_documento === "dni") {
      if (!/^\d{8}$/.test(formToSend.dni)) {
        setError("El DNI debe tener exactamente 8 dígitos.");
        setLoading(false);
        return;
      }
    } else if (formToSend.tipo_documento === "carnet_extranjeria") {
      if (!/^\d{12}$/.test(formToSend.dni)) {
        setError("El Carnet de extranjería debe tener exactamente 12 dígitos.");
        setLoading(false);
        return;
      }
    } else if (formToSend.tipo_documento === "sin_documento") {
      // Genera un DNI provisional de 8 dígitos, por ejemplo: 99990001
      formToSend.dni = (99990000 + Math.floor(Math.random() * 100)).toString();
    }
    try {
      const res = await fetch(BASE_URL + "api_pacientes.php", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formToSend),
        credentials: "include",
      });
      const data = await res.json();
      if (data.success && data.paciente) {
        onRegistroExitoso(data.paciente);
        // Mostrar mensaje de confirmación con el número de HC generado
        MySwal.fire({
          icon: "success",
          title: "Paciente registrado",
          html: `<b>Historia Clínica:</b> ${data.paciente.historia_clinica || '-'}`,
          confirmButtonText: "Aceptar"
        });
      } else {
        setError(
          data.error ||
            (form.id
              ? "Error al actualizar paciente"
              : "Error al registrar paciente")
        );
      }
    } catch {
      setError(
        form.id
          ? "Error de conexión al actualizar"
          : "Error de conexión al registrar"
      );
    }
    setLoading(false);
  };

  return (
  <div className="w-full max-w-full mx-auto">
      <h2
        className="text-2xl font-extrabold mb-6 flex items-center gap-3 justify-center bg-gradient-to-r from-purple-700 via-pink-500 to-blue-500 text-white rounded-xl shadow-lg py-4 px-6 animate__animated animate__fadeInDown"
        style={{ boxShadow: '0 4px 16px rgba(80,0,120,0.12)' }}
      >
        <svg
          className="w-8 h-8 text-white drop-shadow"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M12 2a10 10 0 100 20 10 10 0 000-20zm0 7v4m0 4h.01"
          />
        </svg>
        {form.id ? "Editar Paciente" : "Registrar Nuevo Paciente"}
      </h2>
      {error && (
        <div className="mb-3 p-2 bg-red-100 text-red-700 rounded text-center font-semibold">
          {error}
        </div>
      )}
      <form
        onSubmit={handleSubmit}
        className="space-y-4 bg-blue-50 p-4 rounded border border-blue-200 max-h-[80vh] overflow-y-auto w-full max-w-full mx-auto"
      >
        {/* Sección: Información Básica */}
          <DatosBasicos form={form} handleChange={handleChange} />

        {/* Sección: Datos de Edad */}
          <DatosEdad form={form} handleChange={handleChange} />

        {/* Sección: Información Adicional */}
          <DatosAdicionales form={form} handleChange={handleChange} />

        {/* Sección: Contacto */}
          <DatosContacto form={form} handleChange={handleChange} />

        {/* Botón de envío */}
        <div className="sticky bottom-0 bg-blue-50 p-4 -mx-4 -mb-4 border-t border-blue-200">
          <button
            type="submit"
            className="w-full bg-purple-800 hover:bg-purple-900 text-white rounded-lg px-4 py-3 font-bold text-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            disabled={loading}
          >
            {loading ? (
              <div className="flex items-center justify-center gap-2">
                <svg
                  className="animate-spin h-5 w-5"
                  fill="none"
                  viewBox="0 0 24 24"
                >
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                  ></circle>
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                  ></path>
                </svg>
                {form.id ? "Actualizando..." : "Registrando..."}
              </div>
            ) : form.id ? (
              "Actualizar Paciente"
            ) : (
              "Registrar Paciente"
            )}
          </button>
        </div>
      </form>
    </div>
  );
}

export default PacienteForm;

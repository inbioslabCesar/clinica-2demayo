import { useState, useEffect, useCallback } from "react";
import { BASE_URL } from "../config/config";
import Swal from "sweetalert2";
import TarifasTable from "../components/TarifasTable";
import TarifaModal from "../components/TarifaModal";
import Paginacion from "../components/Paginacion";
import FiltrosTarifas from "../components/FiltrosTarifas";

function GestionTarifasPage() {
  const [tarifas, setTarifas] = useState([]);
  const [medicos, setMedicos] = useState([]); // NUEVO: Lista de médicos
  const [loading, setLoading] = useState(true);
  const [mostrarModal, setMostrarModal] = useState(false);
  const [tarifaEditando, setTarifaEditando] = useState(null);
  const [filtroServicio, setFiltroServicio] = useState("todos");

  // Estados para paginación
  const [paginaActual, setPaginaActual] = useState(1);
  const [elementosPorPagina, setElementosPorPagina] = useState(5);

  // Tipos de servicios médicos (editables en esta interfaz)
  const serviciosMedicos = [
  { value: "consulta", label: "Consultas Médicas" },
  { value: "rayosx", label: "Rayos X" },
  { value: "ecografia", label: "Ecografía" },
  { value: "operacion", label: "Operaciones/Cirugías Mayores" },
  { value: "ocupacional", label: "Medicina Ocupacional" },
  { value: "procedimientos", label: "Procedimientos Médicos" },
  { value: "cirugias", label: "Cirugías Menores" },
  { value: "tratamientos", label: "Tratamientos Especializados" },
  { value: "emergencias", label: "Emergencias" },
  ];

  // Todos los tipos (para mostrar, solo servicios médicos gestionables)
  const todosLosServicios = [...serviciosMedicos];

  const [nuevaTarifa, setNuevaTarifa] = useState({
    servicio_tipo: "consulta",
    medico_id: "",
    descripcion_base: "",
    descripcion: "",
    precio_particular: "",
    precio_seguro: "",
    precio_convenio: "",
    activo: 1,
    porcentaje_medico: "", // % honorario médico
    porcentaje_clinica: "", // % honorario clínica
    monto_medico: "", // monto fijo médico
    monto_clinica: "", // monto fijo clínica
  });

  useEffect(() => {
    cargarTarifas();
    cargarMedicos(); // NUEVO: Cargar lista de médicos
  }, []);

  const cargarMedicos = async () => {
    try {
      const response = await fetch(`${BASE_URL}api_medicos.php`);
      const data = await response.json();

      if (data.success) {
        // Normalizar los IDs a números para evitar problemas de comparación
        const medicosNormalizados = (data.medicos || []).map((medico) => ({
          ...medico,
          id: parseInt(medico.id), // Convertir ID a número
        }));

        setMedicos(medicosNormalizados);
      }
    } catch (error) {
      console.error("Error al cargar médicos:", error);
    }
  };

  // NUEVO: Generar descripción automáticamente
  const generarDescripcion = useCallback(
    (medicoId, descripcionBase) => {
      if (!medicoId || medicoId === "general" || medicoId === "") {
        return descripcionBase || "Consulta General";
      }

      // Buscar médico (ahora con IDs normalizados como números)
      const medico = medicos.find((m) => m.id === parseInt(medicoId));

      if (medico) {
        const nombreCompleto = medico.nombre;
        const especialidad = medico.especialidad
          ? ` - ${medico.especialidad}`
          : "";
        return `${nombreCompleto}${especialidad} - ${
          descripcionBase || "Consulta"
        }`;
      }

      return descripcionBase || "Consulta";
    },
    [medicos]
  );

  const cargarTarifas = async () => {
    try {
      setLoading(true);
      const response = await fetch(`${BASE_URL}api_tarifas.php`, {
        credentials: "include",
      });
      const data = await response.json();
      if (data.success) {
        setTarifas(data.tarifas || []);
      } else {
        console.error("Error al cargar tarifas:", data.error);
      }
    } catch (error) {
      console.error("Error:", error);
      Swal.fire("Error", "Error de conexión al cargar tarifas", "error");
    } finally {
      setLoading(false);
    }
  };

  const abrirModal = (tarifa = null) => {
    // No permitir editar medicamentos ni exámenes de laboratorio
    if (
      tarifa &&
      (tarifa.fuente === "medicamentos" ||
        tarifa.fuente === "examenes_laboratorio")
    ) {
      Swal.fire({
        title: "No Editable",
        text:
          tarifa.fuente === "medicamentos"
            ? "Los precios de medicamentos se gestionan desde el módulo de farmacia."
            : "Los precios de exámenes se gestionan desde el módulo de laboratorio.",
        icon: "info",
        confirmButtonText: "Entendido",
      });
      return;
    }

    if (tarifa) {
      setTarifaEditando(tarifa);

      // Intentar extraer médico y descripción base de la descripción existente
      const descripcionCompleta = tarifa.descripcion;
      let medicoId = "general";
      let descripcionBase = descripcionCompleta;

      // Buscar si la descripción contiene el nombre de algún médico
      const medicoEncontrado = medicos.find((m) =>
        descripcionCompleta.includes(m.nombre)
      );

      if (medicoEncontrado) {
        medicoId = medicoEncontrado.id.toString();
        // Extraer la descripción base removiendo el nombre del médico y especialidad
        const patronMedico = new RegExp(
          `^${medicoEncontrado.nombre}(\\s*-\\s*${medicoEncontrado.especialidad})?\\s*-\\s*`,
          "i"
        );
        descripcionBase = descripcionCompleta.replace(patronMedico, "").trim();
      }

      setNuevaTarifa({
        servicio_tipo: tarifa.servicio_tipo,
        medico_id: medicoId,
        descripcion_base: descripcionBase,
        descripcion: descripcionCompleta,
        precio_particular: tarifa.precio_particular,
        precio_seguro: tarifa.precio_seguro || "",
        precio_convenio: tarifa.precio_convenio || "",
        activo: tarifa.activo,
        porcentaje_medico: tarifa.porcentaje_medico || "",
        porcentaje_clinica: tarifa.porcentaje_clinica || "",
        monto_medico: tarifa.monto_medico || "",
        monto_clinica: tarifa.monto_clinica || "",
      });
    } else {
      setTarifaEditando(null);
      setNuevaTarifa({
        servicio_tipo: "consulta",
        medico_id: "general",
        descripcion_base: "",
        descripcion: "",
        precio_particular: "",
        precio_seguro: "",
        precio_convenio: "",
        activo: 1,
        porcentaje_medico: "",
        porcentaje_clinica: "",
        monto_medico: "",
        monto_clinica: "",
      });
    }
    setMostrarModal(true);
  };

  const cerrarModal = () => {
    setMostrarModal(false);
    setTarifaEditando(null);
    // Reset completo del formulario
    setNuevaTarifa({
      servicio_tipo: "consulta",
      medico_id: "general",
      descripcion_base: "",
      descripcion: "",
      precio_particular: "",
      precio_seguro: "",
      precio_convenio: "",
      activo: 1,
    });
  };

  const guardarTarifa = async () => {
    // Validaciones
    if (!nuevaTarifa.descripcion.trim()) {
      Swal.fire("Error", "La descripción es obligatoria", "error");
      return;
    }
    if (
      !nuevaTarifa.precio_particular ||
      parseFloat(nuevaTarifa.precio_particular) <= 0
    ) {
      Swal.fire("Error", "El precio particular debe ser mayor a 0", "error");
      return;
    }

    try {
      const url = tarifaEditando
        ? `${BASE_URL}api_tarifas.php`
        : `${BASE_URL}api_tarifas.php`;

      const method = tarifaEditando ? "PUT" : "POST";
      // Asegurar que servicio_tipo nunca sea null ni undefined
      const data = tarifaEditando
        ? { ...nuevaTarifa, id: tarifaEditando.id, servicio_tipo: nuevaTarifa.servicio_tipo || tarifaEditando.servicio_tipo }
        : nuevaTarifa;

      const response = await fetch(url, {
        method,
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "include",
        body: JSON.stringify(data),
      });

      const result = await response.json();

      if (result.success) {
        Swal.fire({
          title: "¡Éxito!",
          text: tarifaEditando
            ? "Tarifa actualizada correctamente"
            : "Tarifa creada correctamente",
          icon: "success",
          confirmButtonText: "OK",
        });
        cerrarModal();
        cargarTarifas();
      } else {
        Swal.fire(
          "Error",
          result.error || "Error al guardar la tarifa",
          "error"
        );
      }
    } catch (error) {
      console.error("Error:", error);
      Swal.fire("Error", "Error de conexión", "error");
    }
  };

  const eliminarTarifa = async (id, descripcion) => {
    // No permitir eliminar medicamentos ni exámenes de laboratorio
    if (
      typeof id === "string" &&
      (id.startsWith("med_") || id.startsWith("lab_"))
    ) {
      Swal.fire({
        title: "No Eliminable",
        text: id.startsWith("med_")
          ? "Los medicamentos se eliminan desde el módulo de farmacia."
          : "Los exámenes se eliminan desde el módulo de laboratorio.",
        icon: "info",
        confirmButtonText: "Entendido",
      });
      return;
    }

    const result = await Swal.fire({
      title: "¿Estás seguro?",
      text: `¿Deseas eliminar la tarifa "${descripcion}"?`,
      icon: "warning",
      showCancelButton: true,
      confirmButtonText: "Sí, eliminar",
      cancelButtonText: "Cancelar",
      confirmButtonColor: "#d33",
    });

    if (result.isConfirmed) {
      try {
        const response = await fetch(`${BASE_URL}api_tarifas.php`, {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ id }),
        });

        const data = await response.json();
        if (data.success) {
          Swal.fire("¡Eliminado!", "La tarifa ha sido eliminada", "success");
          cargarTarifas();
        } else {
          Swal.fire(
            "Error",
            data.error || "Error al eliminar la tarifa",
            "error"
          );
        }
      } catch (error) {
        console.error("Error:", error);
        Swal.fire("Error", "Error de conexión", "error");
      }
    }
  };

  const cambiarEstado = async (id, nuevoEstado) => {
    try {
      const response = await fetch(`${BASE_URL}api_tarifas.php`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ id, activo: nuevoEstado }),
      });

      const data = await response.json();
      if (data.success) {
        cargarTarifas();
      } else {
        Swal.fire("Error", data.error || "Error al cambiar estado", "error");
      }
    } catch (error) {
      console.error("Error:", error);
      Swal.fire("Error", "Error de conexión", "error");
    }
  };

  // Mostrar todas las tarifas (excepto laboratorio/farmacia), incluyendo inactivas
  // Mostrar todas las tarifas (excepto laboratorio/farmacia), incluyendo inactivas
  const tarifasFiltradas =
    filtroServicio === "todos"
      ? tarifas.filter(
          (t) => !["laboratorio", "farmacia"].includes(t.servicio_tipo)
        )
      : tarifas.filter(
          (t) =>
            t.servicio_tipo === filtroServicio &&
            !["laboratorio", "farmacia"].includes(t.servicio_tipo)
        );

  // Cálculos de paginación
  const totalElementos = tarifasFiltradas.length;
  const totalPaginas = Math.ceil(totalElementos / elementosPorPagina);
  const indiceInicio = (paginaActual - 1) * elementosPorPagina;
  const indiceFin = indiceInicio + elementosPorPagina;
  const tarifasPaginadas = tarifasFiltradas.slice(indiceInicio, indiceFin);

  // Funciones de paginación
  const cambiarPagina = (nuevaPagina) => {
    setPaginaActual(nuevaPagina);
  };

  const cambiarElementosPorPagina = (nuevaCantidad) => {
    setElementosPorPagina(nuevaCantidad);
    setPaginaActual(1); // Volver a la primera página
  };

  // Reiniciar a primera página cuando cambie el filtro
  useEffect(() => {
    setPaginaActual(1);
  }, [filtroServicio]);

  // NUEVO: Regenerar descripción cuando se cargan los médicos
  useEffect(() => {
    if (
      medicos.length > 0 &&
      nuevaTarifa.medico_id &&
      nuevaTarifa.descripcion_base
    ) {
      const descripcionGenerada = generarDescripcion(
        nuevaTarifa.medico_id,
        nuevaTarifa.descripcion_base
      );
      setNuevaTarifa((prev) => ({
        ...prev,
        descripcion: descripcionGenerada,
      }));
    }
  }, [
    medicos,
    nuevaTarifa.medico_id,
    nuevaTarifa.descripcion_base,
    generarDescripcion,
  ]);

  const obtenerLabelServicio = (tipo) => {
    const servicio = todosLosServicios.find((t) => t.value === tipo);
    return servicio ? servicio.label : tipo;
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center min-h-screen">
        <div className="text-xl">Cargando tarifas...</div>
      </div>
    );
  }

    return (
      <div className="container mx-auto p-6">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-3xl font-bold text-blue-800">💰 Gestión de Tarifas</h1>
          <button
            onClick={() => abrirModal()}
            className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 font-medium"
          >
            ➕ Nueva Tarifa
          </button>
        </div>

        <FiltrosTarifas
          filtroServicio={filtroServicio}
          setFiltroServicio={setFiltroServicio}
          todosLosServicios={todosLosServicios}
          totalElementos={totalElementos}
          paginaActual={paginaActual}
          totalPaginas={totalPaginas}
        />

        <Paginacion
          paginaActual={paginaActual}
          totalPaginas={totalPaginas}
          cambiarPagina={cambiarPagina}
          elementosPorPagina={elementosPorPagina}
          cambiarElementosPorPagina={cambiarElementosPorPagina}
        />

        <TarifasTable
          tarifas={tarifasPaginadas}
          obtenerLabelServicio={obtenerLabelServicio}
          cambiarEstado={cambiarEstado}
          abrirModal={abrirModal}
          eliminarTarifa={eliminarTarifa}
        />

        <TarifaModal
          mostrar={mostrarModal}
          cerrarModal={cerrarModal}
          tarifaEditando={tarifaEditando}
          nuevaTarifa={nuevaTarifa}
          setNuevaTarifa={setNuevaTarifa}
          serviciosMedicos={serviciosMedicos}
          medicos={medicos}
          generarDescripcion={generarDescripcion}
          guardarTarifa={guardarTarifa}
        />
      </div>
    );
}

export default GestionTarifasPage;

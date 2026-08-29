
import React, { useEffect } from "react";
import { BASE_URL } from "../config/config";
import Swal from "sweetalert2";
import TarifasTable from "../components/tarifas/TarifasTable";
import TarifaModal from "../components/tarifas/TarifaModal";
import Paginacion from "../components/comunes/Paginacion";
import FiltrosTarifas from "../components/tarifas/FiltrosTarifas";
import { useTarifasMedicos } from "../hooks/useTarifasMedicos";
import { usePaginacion } from "../hooks/usePaginacion";
import { useFiltrosTarifas } from "../hooks/useFiltrosTarifas";
import { useTarifasCrud } from "../hooks/useTarifasCrud";
import { useTarifaModal } from "../hooks/useTarifaModal";
import { generarDescripcion } from "../utils/generarDescripcion";


const serviciosMedicos = [
  { value: "consulta", label: "Consultas Médicas" },
  { value: "rayosx", label: "Rayos X" },
  { value: "ecografia", label: "Ecografía" },
  { value: "operacion", label: "Operaciones/Cirugías Mayores" },
  { value: "procedimientos", label: "Procedimientos Médicos" },
];
const todosLosServicios = [...serviciosMedicos];
const TARIFAS_FILAS_STORAGE_KEY = "gestion_tarifas_filas_v1";

function normalizarTextoBusqueda(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function GestionTarifasPage() {
  // Hooks personalizados
  const { tarifas, medicos, loading, cargarTarifas } = useTarifasMedicos();
  const {
    filtroMedico,
    setFiltroMedico,
    filtroDescripcion,
    setFiltroDescripcion,
    filtroServicio,
    setFiltroServicio,
  } = useFiltrosTarifas();
  const {
    mostrarModal,
    setMostrarModal,
    tarifaEditando,
    setTarifaEditando,
    nuevaTarifa,
    setNuevaTarifa,
    abrirModal,
    cerrarModal,
  } = useTarifaModal();
  const { guardarTarifa, eliminarTarifa } = useTarifasCrud(
    cargarTarifas,
    setNuevaTarifa,
    setTarifaEditando,
    setMostrarModal
  );

  // Filtrar tarifas gestionables
  const serviciosGestionables = serviciosMedicos.map((s) => s.value);
  let tarifasFiltradas = tarifas.filter((t) => serviciosGestionables.includes(t.servicio_tipo));
  if (filtroServicio !== "todos") {
    tarifasFiltradas = tarifasFiltradas.filter((t) => t.servicio_tipo === filtroServicio);
  }
  if (filtroMedico.trim()) {
    const filtroLower = normalizarTextoBusqueda(filtroMedico);
    tarifasFiltradas = tarifasFiltradas.filter((t) => {
      const medico = medicos.find((m) => Number(m.id) === Number(t.medico_id));
      if (!medico) return false;
      const nombre = normalizarTextoBusqueda(medico.nombres || medico.nombre || "");
      const apellido = normalizarTextoBusqueda(medico.apellidos || medico.apellido || "");
      const nombreCompleto = `${nombre} ${apellido}`.trim();
      return (
        nombreCompleto.includes(filtroLower) ||
        nombre.includes(filtroLower) ||
        apellido.includes(filtroLower)
      );
    });
  }
  if (filtroDescripcion.trim()) {
    const filtroDescLower = normalizarTextoBusqueda(filtroDescripcion);
    tarifasFiltradas = tarifasFiltradas.filter((t) =>
      normalizarTextoBusqueda(t?.descripcion || "").includes(filtroDescLower)
    );
  }

  // Paginación
  const totalElementos = tarifasFiltradas.length;
  const {
    paginaActual,
    elementosPorPagina,
    totalPaginas,
    indiceInicio,
    indiceFin,
    cambiarPagina,
    cambiarElementosPorPagina,
    setPaginaActual,
  } = usePaginacion(totalElementos);
  const tarifasPaginadas = tarifasFiltradas.slice(indiceInicio, indiceFin);

  // Reiniciar a primera página cuando cambien filtros
  useEffect(() => {
    setPaginaActual(1);
  }, [filtroServicio, filtroMedico, filtroDescripcion, setPaginaActual]);

  // Restaurar cantidad de filas guardada para esta vista.
  useEffect(() => {
    try {
      const stored = Number(window.localStorage.getItem(TARIFAS_FILAS_STORAGE_KEY) || 3);
      const permitidos = [3, 5, 10, 25, 50, 100];
      if (permitidos.includes(stored) && stored !== elementosPorPagina) {
        cambiarElementosPorPagina(stored);
      }
    } catch {
      // Si localStorage no está disponible, usar valor por defecto.
    }
    // Solo al montar
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Persistir selección de filas.
  useEffect(() => {
    try {
      window.localStorage.setItem(TARIFAS_FILAS_STORAGE_KEY, String(elementosPorPagina));
    } catch {
      // Si localStorage no está disponible, mantener estado en memoria.
    }
  }, [elementosPorPagina]);

  // Regenerar descripción cuando se cargan los médicos
  useEffect(() => {
    if (
      medicos.length > 0 &&
      nuevaTarifa.medico_id &&
      nuevaTarifa.descripcion_base
    ) {
      const medico = medicos.find((m) => m.id === parseInt(nuevaTarifa.medico_id));
      const descripcionGenerada = generarDescripcion(medico, nuevaTarifa.descripcion_base);
      setNuevaTarifa((prev) => ({
        ...prev,
        descripcion: descripcionGenerada,
      }));
    }
  }, [medicos, nuevaTarifa.medico_id, nuevaTarifa.descripcion_base, setNuevaTarifa]);


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
        filtroMedico={filtroMedico}
        setFiltroMedico={setFiltroMedico}
        filtroDescripcion={filtroDescripcion}
        setFiltroDescripcion={setFiltroDescripcion}
      />
      <Paginacion
        paginaActual={paginaActual}
        totalPaginas={totalPaginas}
        cambiarPagina={cambiarPagina}
        elementosPorPagina={elementosPorPagina}
        cambiarElementosPorPagina={cambiarElementosPorPagina}
        defaultElementosPorPagina={3}
        opcionesElementosPorPagina={[3, 5, 10, 25, 50, 100]}
      />
      <TarifasTable
        tarifas={tarifasPaginadas}
        obtenerLabelServicio={obtenerLabelServicio}
        abrirModal={abrirModal}
        eliminarTarifa={eliminarTarifa}
        medicos={medicos}
      />
      <TarifaModal
        mostrar={mostrarModal}
        cerrarModal={cerrarModal}
        tarifaEditando={tarifaEditando}
        nuevaTarifa={nuevaTarifa}
        setNuevaTarifa={setNuevaTarifa}
        serviciosMedicos={serviciosMedicos}
        medicos={medicos}
        generarDescripcion={(medicoId, descripcionBase) => {
          const medico = medicos.find((m) => Number(m.id) === Number(medicoId));
          return generarDescripcion(medico, descripcionBase);
        }}
        guardarTarifa={() => guardarTarifa(nuevaTarifa, tarifaEditando)}
      />
    </div>
  );
}

export default GestionTarifasPage;

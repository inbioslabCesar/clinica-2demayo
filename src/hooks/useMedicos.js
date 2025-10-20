import { useState, useEffect } from 'react';
import axios from 'axios';
import Swal from 'sweetalert2';
import { BASE_URL } from '../config/config';

const useMedicos = () => {
  // Estados principales
  const [medicos, setMedicos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  
  // Estados del modal de crear
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState({
    nombre: "",
    apellido: "",
    especialidad: "",
    email: "",
    password: "",
    cmp: "",
    rne: "",
    firma: null
  });
  const [formError, setFormError] = useState("");
  const [saving, setSaving] = useState(false);
  
  // Estados del modal de editar
  const [editModal, setEditModal] = useState(false);
  const [editForm, setEditForm] = useState({
    id: null,
    nombre: "",
    apellido: "",
    especialidad: "",
    email: "",
    password: "",
    cmp: "",
    rne: "",
    firma: null
  });
  const [editError, setEditError] = useState("");
  const [editSaving, setEditSaving] = useState(false);

  // Estados de búsqueda y paginación
  const [busqueda, setBusqueda] = useState("");
  const [sortBy, setSortBy] = useState("id");
  const [sortDir, setSortDir] = useState("asc");
  const [rowsPerPage, setRowsPerPage] = useState(5);
  const [page, setPage] = useState(1);

  // Efectos
  useEffect(() => {
    fetchMedicos();
  }, []);

  // Funciones de API
  const fetchMedicos = async () => {
    setLoading(true);
    try {
      const res = await axios.get(BASE_URL + "api_medicos.php");
      setMedicos(res.data.medicos || []);
      setError(null);
    } catch (err) {
      setError("Error al cargar médicos");
      console.error('Error fetching medicos:', err);
    } finally {
      setLoading(false);
    }
  };

  const createMedico = async (medicoData) => {
    setSaving(true);
    setFormError("");
    
    try {
      const res = await axios.post(BASE_URL + "api_medicos.php", medicoData);
      
      if (res.data.success) {
        await fetchMedicos();
        handleCloseModal();
        
        Swal.fire({
          title: '¡Éxito!',
          text: 'Médico registrado correctamente',
          icon: 'success',
          timer: 2000,
          showConfirmButton: false
        });
      } else {
        setFormError(res.data.message || "Error al registrar médico");
      }
    } catch (err) {
      setFormError("Error de conexión al registrar médico");
      console.error('Error creating medico:', err);
    } finally {
      setSaving(false);
    }
  };

  const updateMedico = async (medicoData) => {
    setEditSaving(true);
    setEditError("");
    
    try {
      const res = await axios.put(BASE_URL + "api_medicos.php", medicoData);
      
      if (res.data.success) {
        await fetchMedicos();
        handleEditClose();
        
        Swal.fire({
          title: '¡Éxito!',
          text: 'Médico actualizado correctamente',
          icon: 'success',
          timer: 2000,
          showConfirmButton: false
        });
      } else {
        setEditError(res.data.message || "Error al actualizar médico");
      }
    } catch (err) {
      setEditError("Error de conexión al actualizar médico");
      console.error('Error updating medico:', err);
    } finally {
      setEditSaving(false);
    }
  };

  const deleteMedico = async (id) => {
    const result = await Swal.fire({
      title: '¿Estás seguro?',
      text: 'Esta acción no se puede deshacer',
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#d33',
      cancelButtonColor: '#3085d6',
      confirmButtonText: 'Sí, eliminar',
      cancelButtonText: 'Cancelar'
    });

    if (result.isConfirmed) {
      try {
        const res = await axios.delete(BASE_URL + "api_medicos.php", {
          data: { id }
        });
        
        if (res.data.success) {
          await fetchMedicos();
          
          Swal.fire({
            title: '¡Eliminado!',
            text: 'Médico eliminado correctamente',
            icon: 'success',
            timer: 2000,
            showConfirmButton: false
          });
        } else {
          Swal.fire({
            title: 'Error',
            text: res.data.message || 'Error al eliminar médico',
            icon: 'error'
          });
        }
      } catch (err) {
        Swal.fire({
          title: 'Error',
          text: 'Error de conexión al eliminar médico',
          icon: 'error'
        });
        console.error('Error deleting medico:', err);
      }
    }
  };

  // Funciones de manejo de modales
  const handleOpenModal = () => {
    setShowModal(true);
    setForm({
      nombre: "",
      apellido: "",
      especialidad: "",
      email: "",
      password: "",
      cmp: "",
      rne: "",
      firma: null
    });
    setFormError("");
  };

  const handleCloseModal = () => {
    setShowModal(false);
    setForm({
      nombre: "",
      apellido: "",
      especialidad: "",
      email: "",
      password: "",
      cmp: "",
      rne: "",
      firma: null
    });
    setFormError("");
  };

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setForm(prev => ({
      ...prev,
      [name]: value
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    await createMedico(form);
  };

  const handleEdit = (medico) => {
    setEditModal(true);
    setEditForm({
      id: medico.id,
      nombre: medico.nombre,
      apellido: medico.apellido || "",
      especialidad: medico.especialidad,
      email: medico.email,
      password: "",
      cmp: medico.cmp || "",
      rne: medico.rne || "",
      firma: medico.firma || null
    });
    setEditError("");
  };

  const handleEditClose = () => {
    setEditModal(false);
    setEditForm({
      id: null,
      nombre: "",
      apellido: "",
      especialidad: "",
      email: "",
      password: "",
      cmp: "",
      rne: "",
      firma: null
    });
    setEditError("");
  };

  const handleEditChange = (e) => {
    const { name, value } = e.target;
    setEditForm(prev => ({
      ...prev,
      [name]: value
    }));
  };

  const handleEditSubmit = async (e) => {
    e.preventDefault();
    await updateMedico(editForm);
  };

  // Función de ordenamiento
  const handleSort = (col) => {
    if (sortBy === col) {
      setSortDir(sortDir === "asc" ? "desc" : "asc");
    } else {
      setSortBy(col);
      setSortDir("asc");
    }
    setPage(1);
  };

  // Computed values
  const medicosFiltrados = medicos.filter(medico => {
    if (!busqueda) return true;
    const searchTerm = busqueda.toLowerCase();
    return (
      medico.nombre.toLowerCase().includes(searchTerm) ||
      (medico.apellido && medico.apellido.toLowerCase().includes(searchTerm)) ||
      medico.especialidad.toLowerCase().includes(searchTerm) ||
      medico.email.toLowerCase().includes(searchTerm)
    );
  });

  const medicosOrdenados = [...medicosFiltrados].sort((a, b) => {
    let aVal = a[sortBy];
    let bVal = b[sortBy];
    
    if (typeof aVal === 'string') {
      aVal = aVal.toLowerCase();
      bVal = bVal.toLowerCase();
    }
    
    if (sortDir === "asc") {
      return aVal < bVal ? -1 : aVal > bVal ? 1 : 0;
    } else {
      return aVal > bVal ? -1 : aVal < bVal ? 1 : 0;
    }
  });

  const totalRows = medicosOrdenados.length;
  const totalPages = Math.ceil(totalRows / rowsPerPage);
  const startIdx = (page - 1) * rowsPerPage;
  const endIdx = startIdx + rowsPerPage;
  const paginatedMedicos = medicosOrdenados.slice(startIdx, endIdx);

  return {
    // Estados
    medicos: paginatedMedicos,
    allMedicos: medicosOrdenados,
    loading,
    error,
    
    // Modal de crear
    showModal,
    form,
    formError,
    saving,
    
    // Modal de editar  
    editModal,
    editForm,
    editError,
    editSaving,
    
    // Búsqueda y paginación
    busqueda,
    setBusqueda,
    sortBy,
    sortDir,
    rowsPerPage,
    setRowsPerPage,
    page,
    setPage,
    totalRows,
    totalPages,
    startIdx,
    endIdx,
    
    // Funciones
    handleOpenModal,
    handleCloseModal,
    handleInputChange,
    handleSubmit,
    handleEdit,
    handleEditClose,
    handleEditChange,
    handleEditSubmit,
    handleSort,
    deleteMedico,
    fetchMedicos
  };
};

export default useMedicos;
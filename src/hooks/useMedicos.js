import { useState, useEffect } from 'react';
import axios from 'axios';
import Swal from 'sweetalert2';
import { BASE_URL } from '../config/config';

const EMPTY_MEDICO_FORM = {
  nombre: '',
  apellido: '',
  especialidad: '',
  tipo_profesional: 'medico',
  abreviatura_profesional: 'Dr(a).',
  colegio_sigla: 'CMP',
  nro_colegiatura: '',
  email: '',
  password: '',
  cmp: '',
  rne: '',
  firma: null,
  modalidad_pago: 'acto',
  monto_hora: '',
  frecuencia_pago: 'mensual',
  permite_adelanto: false,
  tope_adelanto_periodo: '',
};

const useMedicos = () => {
  const [medicos, setMedicos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState({ ...EMPTY_MEDICO_FORM });
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);

  const [editModal, setEditModal] = useState(false);
  const [editForm, setEditForm] = useState({ id: null, ...EMPTY_MEDICO_FORM });
  const [editError, setEditError] = useState('');
  const [editSaving, setEditSaving] = useState(false);

  const [busqueda, setBusqueda] = useState('');
  const [sortBy, setSortBy] = useState('id');
  const [sortDir, setSortDir] = useState('desc');
  const [rowsPerPage, setRowsPerPage] = useState(5);
  const [page, setPage] = useState(1);

  useEffect(() => {
    fetchMedicos();
  }, []);

  const fetchMedicos = async () => {
    setLoading(true);
    try {
      const res = await axios.get(BASE_URL + 'api_medicos.php');
      setMedicos(res.data.medicos || []);
      setError(null);
    } catch {
      setError('Error al cargar medicos');
    } finally {
      setLoading(false);
    }
  };

  const createMedico = async (medicoData) => {
    setSaving(true);
    setFormError('');

    try {
      // Normalizar montos a 2 decimales para evitar errores de precision
      const data = { ...medicoData };
      if (data.monto_hora) {
        data.monto_hora = Math.round(parseFloat(data.monto_hora) * 100) / 100;
      }
      if (data.tope_adelanto_periodo) {
        data.tope_adelanto_periodo = Math.round(parseFloat(data.tope_adelanto_periodo) * 100) / 100;
      }
      
      const res = await axios.post(BASE_URL + 'api_medicos.php', data);
      if (res.data.success) {
        await fetchMedicos();
        handleCloseModal();
        Swal.fire({
          title: 'Exito',
          text: 'Medico registrado correctamente',
          icon: 'success',
          timer: 2000,
          showConfirmButton: false,
        });
      } else {
        setFormError(res.data.error || 'Error al registrar medico');
      }
    } catch {
      setFormError('Error de conexion al registrar medico');
    } finally {
      setSaving(false);
    }
  };

  const updateMedico = async (medicoData) => {
    setEditSaving(true);
    setEditError('');

    try {
      // Normalizar montos a 2 decimales para evitar errores de precision
      const data = { ...medicoData };
      if (data.monto_hora) {
        data.monto_hora = Math.round(parseFloat(data.monto_hora) * 100) / 100;
      }
      if (data.tope_adelanto_periodo) {
        data.tope_adelanto_periodo = Math.round(parseFloat(data.tope_adelanto_periodo) * 100) / 100;
      }
      
      const res = await axios.put(BASE_URL + 'api_medicos.php', data);
      if (res.data.success) {
        await fetchMedicos();
        handleEditClose();
        Swal.fire({
          title: 'Exito',
          text: 'Medico actualizado correctamente',
          icon: 'success',
          timer: 2000,
          showConfirmButton: false,
        });
      } else {
        setEditError(res.data.error || 'Error al actualizar medico');
      }
    } catch {
      setEditError('Error de conexion al actualizar medico');
    } finally {
      setEditSaving(false);
    }
  };

  const deleteMedico = async (id) => {
    const result = await Swal.fire({
      title: 'Estas seguro?',
      text: 'Esta accion no se puede deshacer',
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#d33',
      cancelButtonColor: '#3085d6',
      confirmButtonText: 'Si, eliminar',
      cancelButtonText: 'Cancelar',
    });

    if (!result.isConfirmed) return;

    try {
      const res = await axios.delete(BASE_URL + 'api_medicos.php', { data: { id } });
      if (res.data.success) {
        await fetchMedicos();
        Swal.fire({
          title: 'Eliminado',
          text: 'Medico eliminado correctamente',
          icon: 'success',
          timer: 2000,
          showConfirmButton: false,
        });
      } else {
        Swal.fire('Error', res.data.error || 'Error al eliminar medico', 'error');
      }
    } catch {
      Swal.fire('Error', 'Error de conexion al eliminar medico', 'error');
    }
  };

  const verDeudaMedico = async (medico) => {
    try {
      const medicoId = Number(medico?.id || 0);
      if (!medicoId) return;

      const res = await axios.get(`${BASE_URL}api_medico_cuenta_corriente.php?medico_id=${medicoId}`, {
        withCredentials: true,
      });

      if (!res.data?.success) {
        Swal.fire('Error', res.data?.error || 'No se pudo calcular la deuda del medico', 'error');
        return;
      }

      const r = res.data.resumen || {};
      const p = res.data.periodo_actual || {};
      const fmt = (n) => `S/ ${Number(n || 0).toFixed(2)}`;

      await Swal.fire({
        title: `Cuenta de ${medico.nombre} ${medico.apellido || ''}`,
        html: `
          <div style="text-align:left;line-height:1.65">
            <div><strong>Periodo actual:</strong> ${p.inicio || '-'} al ${p.fin || '-'}</div>
            <hr style="margin:10px 0;border-color:#eee" />
            <div><strong>Pendiente honorarios (total):</strong> ${fmt(r.pendiente_honorarios_total)}</div>
            <div><strong>Adelantos activos (total):</strong> ${fmt(r.adelantos_activos_total)}</div>
            <div><strong>Deuda neta (total):</strong> ${fmt(r.deuda_neta_total)}</div>
            <hr style="margin:10px 0;border-color:#eee" />
            <div><strong>Pendiente periodo:</strong> ${fmt(r.pendiente_honorarios_periodo)}</div>
            <div><strong>Adelantos periodo:</strong> ${fmt(r.adelantos_periodo)}</div>
            <div><strong>Deuda neta periodo:</strong> ${fmt(r.deuda_neta_periodo)}</div>
          </div>
        `,
        icon: 'info',
        confirmButtonText: 'Cerrar',
      });
    } catch {
      Swal.fire('Error', 'No se pudo consultar la cuenta corriente del medico', 'error');
    }
  };

  const handleOpenModal = () => {
    setShowModal(true);
    setForm({ ...EMPTY_MEDICO_FORM });
    setFormError('');
  };

  const handleCloseModal = () => {
    setShowModal(false);
    setForm({ ...EMPTY_MEDICO_FORM });
    setFormError('');
  };

  const handleInputChange = (e) => {
    const { name, value, type, checked } = e.target;
    setForm((prev) => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value,
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
      apellido: medico.apellido || '',
      especialidad: medico.especialidad,
      tipo_profesional: medico.tipo_profesional || 'medico',
      abreviatura_profesional: medico.abreviatura_profesional || 'Dr(a).',
      colegio_sigla: medico.colegio_sigla || 'CMP',
      nro_colegiatura: medico.nro_colegiatura || medico.cmp || '',
      email: medico.email,
      password: '',
      cmp: medico.cmp || '',
      rne: medico.rne || '',
      firma: medico.firma || null,
      modalidad_pago: medico.modalidad_pago || 'acto',
      monto_hora: medico.monto_hora ?? '',
      frecuencia_pago: medico.frecuencia_pago || 'mensual',
      permite_adelanto: Number(medico.permite_adelanto || 0) === 1,
      tope_adelanto_periodo: medico.tope_adelanto_periodo ?? '',
    });
    setEditError('');
  };

  const handleEditClose = () => {
    setEditModal(false);
    setEditForm({ id: null, ...EMPTY_MEDICO_FORM });
    setEditError('');
  };

  const handleEditChange = (e) => {
    const { name, value, type, checked } = e.target;
    setEditForm((prev) => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value,
    }));
  };

  const handleEditSubmit = async (e) => {
    e.preventDefault();
    await updateMedico(editForm);
  };

  const handleSort = (col) => {
    if (sortBy === col) {
      setSortDir(sortDir === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(col);
      setSortDir('asc');
    }
    setPage(1);
  };

  const medicosFiltrados = medicos.filter((medico) => {
    if (!busqueda) return true;
    const searchTerm = busqueda.toLowerCase();
    return (
      String(medico.nombre || '').toLowerCase().includes(searchTerm) ||
      String(medico.apellido || '').toLowerCase().includes(searchTerm) ||
      String(medico.especialidad || '').toLowerCase().includes(searchTerm) ||
      String(medico.email || '').toLowerCase().includes(searchTerm)
    );
  });

  const medicosOrdenados = [...medicosFiltrados].sort((a, b) => {
    let aVal = a[sortBy];
    let bVal = b[sortBy];

    if (sortBy === 'id') {
      aVal = Number(aVal || 0);
      bVal = Number(bVal || 0);
    } else if (typeof aVal === 'string') {
      aVal = aVal.toLowerCase();
      bVal = String(bVal || '').toLowerCase();
    }

    if (sortDir === 'asc') {
      return aVal < bVal ? -1 : aVal > bVal ? 1 : 0;
    }
    return aVal > bVal ? -1 : aVal < bVal ? 1 : 0;
  });

  const totalRows = medicosOrdenados.length;
  const totalPages = Math.ceil(totalRows / rowsPerPage);
  const startIdx = (page - 1) * rowsPerPage;
  const endIdx = startIdx + rowsPerPage;
  const paginatedMedicos = medicosOrdenados.slice(startIdx, endIdx);

  return {
    medicos: paginatedMedicos,
    allMedicos: medicosOrdenados,
    loading,
    error,

    showModal,
    form,
    formError,
    saving,

    editModal,
    editForm,
    editError,
    editSaving,

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
    verDeudaMedico,
    fetchMedicos,
  };
};

export default useMedicos;

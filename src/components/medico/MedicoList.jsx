import useMedicos from '../../hooks/useMedicos';
import MedicoSearchBar from './MedicoSearchBar';
import MedicoTable from './MedicoTable';
import MedicoFormModal from './MedicoFormModal';

function MedicoList() {
  const {
    // Estados
    medicos,
    allMedicos,
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
    deleteMedico
  } = useMedicos();

  return (
    <div className="bg-gradient-to-br from-blue-50 via-purple-50 to-pink-50 min-h-screen">
      <div className="container mx-auto px-4 py-8">
        <div className="max-w-7xl mx-auto">
          {/* Barra de búsqueda y acciones */}
          <MedicoSearchBar
            busqueda={busqueda}
            setBusqueda={setBusqueda}
            onAddNew={handleOpenModal}
            medicos={allMedicos}
            totalCount={totalRows}
          />

          {/* Tabla de médicos */}
          <MedicoTable
            medicos={medicos}
            loading={loading}
            error={error}
            sortBy={sortBy}
            sortDir={sortDir}
            onSort={handleSort}
            onEdit={handleEdit}
            onDelete={deleteMedico}
            // Paginación
            page={page}
            setPage={setPage}
            rowsPerPage={rowsPerPage}
            setRowsPerPage={setRowsPerPage}
            totalPages={totalPages}
            totalRows={totalRows}
            startIdx={startIdx}
            endIdx={endIdx}
          />

          {/* Modal para crear médico */}
          <MedicoFormModal
            isOpen={showModal}
            onClose={handleCloseModal}
            mode="create"
            formData={form}
            onChange={handleInputChange}
            onSubmit={handleSubmit}
            error={formError}
            isSaving={saving}
          />

          {/* Modal para editar médico */}
          <MedicoFormModal
            isOpen={editModal}
            onClose={handleEditClose}
            mode="edit"
            formData={editForm}
            onChange={handleEditChange}
            onSubmit={handleEditSubmit}
            error={editError}
            isSaving={editSaving}
          />
        </div>
      </div>
    </div>
  );
}

export default MedicoList;
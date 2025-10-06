import { useState, useEffect } from 'react';
import { BASE_URL } from '../config/config';
import Swal from 'sweetalert2';

function GestionTarifas() {
  const [tarifas, setTarifas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [formData, setFormData] = useState({
    servicio_tipo: 'consulta',
    descripcion: '',
    precio_particular: '',
    precio_seguro: '',
    precio_convenio: '',
    activo: 1
  });
  const [editingId, setEditingId] = useState(null);

  const serviciosTipos = [
    { value: 'consulta', label: 'Consulta Médica' },
    { value: 'rayosx', label: 'Rayos X' },
    { value: 'ecografia', label: 'Ecografía' },
    { value: 'ocupacional', label: 'Medicina Ocupacional' }
  ];

  useEffect(() => {
    cargarTarifas();
  }, []);

  const cargarTarifas = async () => {
    setLoading(true);
    try {
      const response = await fetch(`${BASE_URL}api_tarifas.php`, {
        credentials: 'include'
      });
      const data = await response.json();
      if (data.success) {
        setTarifas(data.tarifas || []);
      } else {
        Swal.fire('Error', 'No se pudieron cargar las tarifas', 'error');
      }
    } catch (error) {
      console.error('Error:', error);
      Swal.fire('Error', 'Error de conexión', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!formData.descripcion || !formData.precio_particular) {
      Swal.fire('Error', 'Complete los campos obligatorios', 'error');
      return;
    }

    try {
      const url = `${BASE_URL}api_tarifas.php`;
      const method = editingId ? 'PUT' : 'POST';
      const payload = editingId ? { ...formData, id: editingId } : formData;

      const response = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json'
        },
        credentials: 'include',
        body: JSON.stringify(payload)
      });

      const result = await response.json();

      if (result.success) {
        Swal.fire('Éxito', `Tarifa ${editingId ? 'actualizada' : 'creada'} correctamente`, 'success');
        cargarTarifas();
        resetForm();
      } else {
        Swal.fire('Error', result.error || 'Error al procesar la tarifa', 'error');
      }
    } catch (error) {
      console.error('Error:', error);
      Swal.fire('Error', 'Error de conexión', 'error');
    }
  };

  const handleEdit = (tarifa) => {
    setFormData({
      servicio_tipo: tarifa.servicio_tipo,
      descripcion: tarifa.descripcion,
      precio_particular: tarifa.precio_particular,
      precio_seguro: tarifa.precio_seguro || '',
      precio_convenio: tarifa.precio_convenio || '',
      activo: tarifa.activo
    });
    setEditingId(tarifa.id);
  };

  const handleDelete = async (id) => {
    const result = await Swal.fire({
      title: '¿Está seguro?',
      text: 'Esta acción desactivará la tarifa',
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'Sí, desactivar',
      cancelButtonText: 'Cancelar'
    });

    if (result.isConfirmed) {
      try {
        const response = await fetch(`${BASE_URL}api_tarifas.php`, {
          method: 'DELETE',
          headers: {
            'Content-Type': 'application/json'
          },
          credentials: 'include',
          body: JSON.stringify({ id })
        });

        const data = await response.json();

        if (data.success) {
          Swal.fire('Éxito', 'Tarifa desactivada', 'success');
          cargarTarifas();
        } else {
          Swal.fire('Error', data.error || 'Error al desactivar tarifa', 'error');
        }
      } catch (error) {
        console.error('Error:', error);
        Swal.fire('Error', 'Error de conexión', 'error');
      }
    }
  };

  const resetForm = () => {
    setFormData({
      servicio_tipo: 'consulta',
      descripcion: '',
      precio_particular: '',
      precio_seguro: '',
      precio_convenio: '',
      activo: 1
    });
    setEditingId(null);
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="text-lg">Cargando tarifas...</div>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto p-6">
      <h1 className="text-2xl font-bold mb-6 text-blue-800">💰 Gestión de Tarifas</h1>

      {/* Formulario */}
      <div className="bg-white rounded-lg shadow-md p-6 mb-6">
        <h2 className="text-xl font-semibold mb-4">
          {editingId ? 'Editar Tarifa' : 'Nueva Tarifa'}
        </h2>
        
        <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Tipo de Servicio *
            </label>
            <select
              name="servicio_tipo"
              value={formData.servicio_tipo}
              onChange={handleChange}
              className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
              required
            >
              {serviciosTipos.map(tipo => (
                <option key={tipo.value} value={tipo.value}>
                  {tipo.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Descripción *
            </label>
            <input
              type="text"
              name="descripcion"
              value={formData.descripcion}
              onChange={handleChange}
              className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Ej: Consulta Medicina General"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Precio Particular (S/) *
            </label>
            <input
              type="number"
              name="precio_particular"
              value={formData.precio_particular}
              onChange={handleChange}
              className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
              step="0.01"
              min="0"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Precio Seguro (S/)
            </label>
            <input
              type="number"
              name="precio_seguro"
              value={formData.precio_seguro}
              onChange={handleChange}
              className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
              step="0.01"
              min="0"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Precio Convenio (S/)
            </label>
            <input
              type="number"
              name="precio_convenio"
              value={formData.precio_convenio}
              onChange={handleChange}
              className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
              step="0.01"
              min="0"
            />
          </div>

          <div className="flex items-center">
            <input
              type="checkbox"
              name="activo"
              checked={formData.activo === 1}
              onChange={(e) => setFormData(prev => ({ ...prev, activo: e.target.checked ? 1 : 0 }))}
              className="mr-2"
            />
            <label className="text-sm font-medium text-gray-700">
              Tarifa activa
            </label>
          </div>

          <div className="md:col-span-2 flex gap-4">
            <button
              type="submit"
              className="bg-blue-600 text-white px-6 py-2 rounded-md hover:bg-blue-700 transition-colors"
            >
              {editingId ? 'Actualizar' : 'Crear'} Tarifa
            </button>
            
            {editingId && (
              <button
                type="button"
                onClick={resetForm}
                className="bg-gray-500 text-white px-6 py-2 rounded-md hover:bg-gray-600 transition-colors"
              >
                Cancelar
              </button>
            )}
          </div>
        </form>
      </div>

      {/* Lista de tarifas */}
      <div className="bg-white rounded-lg shadow-md overflow-hidden">
        <h2 className="text-xl font-semibold p-6 bg-gray-50 border-b">Lista de Tarifas</h2>
        
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-100">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Servicio
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Descripción
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Particular
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Seguro
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Convenio
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Estado
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Acciones
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {tarifas
                .filter(tarifa => ['consulta', 'rayosx', 'ecografia', 'ocupacional'].includes(tarifa.servicio_tipo))
                .map((tarifa) => (
                  <tr key={tarifa.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900 capitalize">
                      {tarifa.servicio_tipo}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {tarifa.descripcion}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      S/ {parseFloat(tarifa.precio_particular).toFixed(2)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {tarifa.precio_seguro ? `S/ ${parseFloat(tarifa.precio_seguro).toFixed(2)}` : '-'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {tarifa.precio_convenio ? `S/ ${parseFloat(tarifa.precio_convenio).toFixed(2)}` : '-'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
                        tarifa.activo === 1 
                          ? 'bg-green-100 text-green-800' 
                          : 'bg-red-100 text-red-800'
                      }`}>
                        {tarifa.activo === 1 ? 'Activa' : 'Inactiva'}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                      <button
                        onClick={() => handleEdit(tarifa)}
                        className="text-blue-600 hover:text-blue-900 mr-4"
                      >
                        Editar
                      </button>
                      <button
                        onClick={() => handleDelete(tarifa.id)}
                        className="text-red-600 hover:text-red-900"
                      >
                        Desactivar
                      </button>
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>

        {tarifas.length === 0 && (
          <div className="text-center py-8 text-gray-500">
            No hay tarifas registradas
          </div>
        )}
      </div>
    </div>
  );
}

export default GestionTarifas;
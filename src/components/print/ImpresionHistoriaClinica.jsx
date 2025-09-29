const ImpresionHistoriaClinica = ({ 
  paciente, 
  triaje, 
  hc, 
  diagnosticos,
  medicoInfo,
  configuracionClinica 
}) => {
  // Función para obtener la ruta del logo según el entorno
  const getLogoPath = () => {
    // Intentar detectar si estamos en producción por el hostname o protocol
    const isProduction = window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1';
    
    if (isProduction) {
      // En producción (Hostinger), usar ruta absoluta desde la raíz del dominio
      return `${window.location.protocol}//${window.location.host}/2demayo.svg`;
    } else {
      // En desarrollo local, usar la ruta relativa a public
      return '/2demayo.svg';
    }
  };
  const formatearFecha = (fecha) => {
    if (!fecha) return '';
    return new Date(fecha).toLocaleDateString('es-ES', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  };

  const formatearHora = (fecha) => {
    if (!fecha) return '';
    return new Date(fecha).toLocaleTimeString('es-ES', {
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  return (
    <div className="bg-white p-8 max-w-4xl mx-auto shadow-lg print:shadow-none print:max-w-none">
      {/* Encabezado de la clínica */}
      <div className="text-center border-b-2 border-blue-600 pb-4 mb-6">
        <div className="flex items-center justify-center gap-4 mb-2">
          <img 
            src={getLogoPath()} 
            alt="Logo Clínica 2 de Mayo" 
            className="h-16 w-auto"
          />
          <div>
            <h1 className="text-2xl font-bold text-blue-800">
              {configuracionClinica?.nombre_clinica || 'CLÍNICA 2 DE MAYO'}
            </h1>
            <p className="text-sm text-gray-600">
              {configuracionClinica?.direccion || 'Dirección de la clínica'}
            </p>
            <p className="text-sm text-gray-600">
              Tel: {configuracionClinica?.telefono || '123-456-789'} | Email: {configuracionClinica?.email || 'contacto@clinica2demayo.com'}
            </p>
          </div>
        </div>
      </div>

      {/* Título del documento */}
      <div className="text-center mb-6">
        <h2 className="text-xl font-bold text-gray-800 border-b border-gray-300 pb-2">
          📋 HISTORIA CLÍNICA
        </h2>
        <div className="flex justify-between text-sm text-gray-600 mt-2">
          <span>Fecha: {formatearFecha(new Date())}</span>
          <span>Hora: {formatearHora(new Date())}</span>
        </div>
      </div>

      {/* Datos del paciente */}
      <div className="grid grid-cols-2 gap-6 mb-6 p-4 bg-blue-50 rounded-lg border">
        <div>
          <h3 className="font-semibold text-blue-800 mb-2 border-b border-blue-200">
            👤 DATOS DEL PACIENTE
          </h3>
          <div className="space-y-1 text-sm">
            <p><strong>Nombre:</strong> {paciente?.nombres} {paciente?.apellidos}</p>
            <p><strong>DNI:</strong> {paciente?.dni}</p>
            <p><strong>Edad:</strong> {paciente?.edad} años</p>
            <p><strong>Sexo:</strong> {paciente?.sexo}</p>
            <p><strong>Teléfono:</strong> {paciente?.telefono}</p>
          </div>
        </div>
        
        <div>
          <h3 className="font-semibold text-blue-800 mb-2 border-b border-blue-200">
            🩺 INFORMACIÓN MÉDICA
          </h3>
          <div className="space-y-1 text-sm">
            <p><strong>Médico:</strong> {medicoInfo?.nombre}</p>
            <p><strong>CMP:</strong> {medicoInfo?.cmp || 'N/A'}</p>
            <p><strong>Especialidad:</strong> {medicoInfo?.especialidad}</p>
            <p><strong>Fecha Consulta:</strong> {formatearFecha(paciente?.fecha_consulta)}</p>
          </div>
        </div>
      </div>

      {/* Motivo de consulta desde triaje */}
      {triaje?.motivo && (
        <div className="mb-6 p-4 bg-yellow-50 rounded-lg border border-yellow-200">
          <h3 className="font-semibold text-yellow-800 mb-2 border-b border-yellow-300">
            📝 MOTIVO DE CONSULTA
          </h3>
          <p className="text-sm leading-relaxed">{triaje.motivo}</p>
        </div>
      )}

      {/* Signos vitales del triaje */}
      {triaje && (
        <div className="mb-6 p-4 bg-green-50 rounded-lg border border-green-200">
          <h3 className="font-semibold text-green-800 mb-2 border-b border-green-300">
            ❤️ SIGNOS VITALES
          </h3>
          <div className="grid grid-cols-4 gap-4 text-sm">
            {triaje.presion_arterial && (
              <div>
                <strong>P/A:</strong> {triaje.presion_arterial} mmHg
              </div>
            )}
            {triaje.frecuencia_cardiaca && (
              <div>
                <strong>FC:</strong> {triaje.frecuencia_cardiaca} lpm
              </div>
            )}
            {triaje.frecuencia_respiratoria && (
              <div>
                <strong>FR:</strong> {triaje.frecuencia_respiratoria} rpm
              </div>
            )}
            {triaje.temperatura && (
              <div>
                <strong>T°:</strong> {triaje.temperatura}°C
              </div>
            )}
            {triaje.saturacion && (
              <div>
                <strong>SpO₂:</strong> {triaje.saturacion}%
              </div>
            )}
            {triaje.peso && (
              <div>
                <strong>Peso:</strong> {triaje.peso} kg
              </div>
            )}
            {triaje.talla && (
              <div>
                <strong>Talla:</strong> {triaje.talla} cm
              </div>
            )}
            {triaje.peso && triaje.talla && (
              <div>
                <strong>IMC:</strong> {(parseFloat(triaje.peso) / Math.pow(parseFloat(triaje.talla) / 100, 2)).toFixed(1)} kg/m²
              </div>
            )}
          </div>
        </div>
      )}

      {/* Anamnesis */}
      <div className="mb-6 p-4 bg-purple-50 rounded-lg border border-purple-200">
        <h3 className="font-semibold text-purple-800 mb-3 border-b border-purple-300">
          🔍 ANAMNESIS
        </h3>
        
        <div className="grid grid-cols-3 gap-4 mb-4 text-sm">
          {hc.tiempo_enfermedad && (
            <div>
              <strong>Tiempo de Enfermedad:</strong>
              <p className="mt-1 p-2 bg-white rounded border">{hc.tiempo_enfermedad}</p>
            </div>
          )}
          {hc.forma_inicio && (
            <div>
              <strong>Forma de Inicio:</strong>
              <p className="mt-1 p-2 bg-white rounded border">{hc.forma_inicio}</p>
            </div>
          )}
          {hc.curso && (
            <div>
              <strong>Curso:</strong>
              <p className="mt-1 p-2 bg-white rounded border">{hc.curso}</p>
            </div>
          )}
        </div>

        {hc.descripcion_general && (
          <div className="text-sm">
            <strong>Descripción General:</strong>
            <p className="mt-1 p-2 bg-white rounded border">{hc.descripcion_general}</p>
          </div>
        )}
      </div>

      {/* Antecedentes */}
      {hc.antecedentes && (
        <div className="mb-6 p-4 bg-orange-50 rounded-lg border border-orange-200">
          <h3 className="font-semibold text-orange-800 mb-2 border-b border-orange-300">
            📚 ANTECEDENTES
          </h3>
          <p className="text-sm leading-relaxed p-2 bg-white rounded border">{hc.antecedentes}</p>
        </div>
      )}

      {/* Examen físico */}
      {hc.examen_fisico && (
        <div className="mb-6 p-4 bg-teal-50 rounded-lg border border-teal-200">
          <h3 className="font-semibold text-teal-800 mb-2 border-b border-teal-300">
            🔬 EXAMEN FÍSICO
          </h3>
          <p className="text-sm leading-relaxed p-2 bg-white rounded border">{hc.examen_fisico}</p>
        </div>
      )}

      {/* Diagnósticos */}
      {diagnosticos && diagnosticos.length > 0 && (
        <div className="mb-6 p-4 bg-red-50 rounded-lg border border-red-200">
          <h3 className="font-semibold text-red-800 mb-2 border-b border-red-300">
            🎯 DIAGNÓSTICOS
          </h3>
          <div className="space-y-2">
            {diagnosticos.map((diagnostico, index) => (
              <div key={index} className="text-sm p-2 bg-white rounded border">
                <strong>{diagnostico.tipo}:</strong> {diagnostico.codigo} - {diagnostico.descripcion}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Tratamiento */}
      {hc.tratamiento && (
        <div className="mb-6 p-4 bg-indigo-50 rounded-lg border border-indigo-200">
          <h3 className="font-semibold text-indigo-800 mb-2 border-b border-indigo-300">
            💊 PLAN DE TRATAMIENTO
          </h3>
          <p className="text-sm leading-relaxed p-2 bg-white rounded border">{hc.tratamiento}</p>
        </div>
      )}

      {/* Pie de página con firma */}
      <div className="mt-8 pt-4 border-t-2 border-gray-300">
        <div className="flex justify-between items-end">
          <div className="text-xs text-gray-600">
            <p>Documento generado digitalmente</p>
            <p>Fecha de impresión: {formatearFecha(new Date())} - {formatearHora(new Date())}</p>
          </div>
          
          <div className="text-center">
            <div className="border-t-2 border-gray-400 pt-2 mt-8 min-w-[200px]">
              <p className="font-semibold text-sm">{medicoInfo?.nombre}</p>
              <p className="text-xs text-gray-600">CMP: {medicoInfo?.cmp || 'N/A'}</p>
              <p className="text-xs text-gray-600">{medicoInfo?.especialidad}</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ImpresionHistoriaClinica;
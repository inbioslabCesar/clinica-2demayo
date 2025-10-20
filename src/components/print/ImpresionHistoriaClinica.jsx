const ImpresionHistoriaClinica = ({ 
  paciente, 
  triaje, 
  hc, 
  diagnosticos,
  medicamentos,
  ordenesLaboratorio,
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

  // Función para mostrar mensaje cuando no hay datos
  const SeccionVacia = ({ titulo, mensaje = "No hay información registrada" }) => (
    <div className="mb-6 p-4 bg-gray-50 rounded-lg border border-gray-200">
      <h3 className="font-semibold text-gray-600 mb-2 border-b border-gray-300">
        {titulo}
      </h3>
      <p className="text-sm text-gray-500 italic text-center p-4">
        {mensaje}
      </p>
    </div>
  );

  return (
    <div className="bg-white p-8 max-w-4xl mx-auto shadow-lg print:shadow-none print:max-w-none">
      <style jsx>{`
        @media print {
          .firma-medico {
            break-inside: avoid;
            page-break-inside: avoid;
          }
          .firma-imagen {
            print-color-adjust: exact;
            -webkit-print-color-adjust: exact;
          }
        }
      `}</style>
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
            <p><strong>Médico:</strong> Dr(a). {medicoInfo?.nombre} {medicoInfo?.apellido}</p>
            <p><strong>CMP:</strong> {medicoInfo?.cmp || 'N/A'}</p>
            {medicoInfo?.rne && <p><strong>RNE:</strong> {medicoInfo.rne}</p>}
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
      {diagnosticos && diagnosticos.length > 0 ? (
        <div className="mb-6 p-4 bg-red-50 rounded-lg border border-red-200 seccion-diagnosticos">
          <h3 className="font-semibold text-red-800 mb-2 border-b border-red-300">
            🎯 DIAGNÓSTICOS CIE-10
          </h3>
          <div className="space-y-3">
            {diagnosticos.map((diagnostico, index) => (
              <div key={index} className="text-sm p-3 bg-white rounded border border-red-100">
                <div className="flex items-start gap-3">
                  <span className="inline-block w-6 h-6 bg-red-500 text-white text-xs font-bold rounded-full flex items-center justify-center flex-shrink-0">
                    {index + 1}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2 mb-1">
                      <span className="inline-block px-2 py-1 bg-red-100 text-red-800 text-xs font-semibold rounded">
                        {diagnostico.tipo || 'Principal'}
                      </span>
                      <span className="inline-block px-2 py-1 bg-gray-100 text-gray-800 text-xs font-mono rounded">
                        {diagnostico.codigo}
                      </span>
                    </div>
                    <p className="text-sm font-medium text-gray-900 leading-relaxed">
                      {diagnostico.descripcion}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <SeccionVacia titulo="🎯 DIAGNÓSTICOS CIE-10" mensaje="No se han registrado diagnósticos para esta consulta" />
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

      {/* Receta Médica */}
      {medicamentos && medicamentos.length > 0 ? (
        <div className="mb-6 p-4 bg-green-50 rounded-lg border border-green-200 seccion-medicamentos">
          <h3 className="font-semibold text-green-800 mb-2 border-b border-green-300">
            💉 RECETA MÉDICA
          </h3>
          <div className="space-y-3">
            {medicamentos.map((medicamento, index) => (
              <div key={index} className="text-sm p-3 bg-white rounded border border-green-100">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p><strong>Medicamento:</strong> {medicamento.medicamento}</p>
                    <p><strong>Concentración:</strong> {medicamento.concentracion}</p>
                    <p><strong>Forma Farmacéutica:</strong> {medicamento.forma_farmaceutica}</p>
                  </div>
                  <div>
                    <p><strong>Dosis:</strong> {medicamento.dosis}</p>
                    <p><strong>Frecuencia:</strong> {medicamento.frecuencia}</p>
                    <p><strong>Duración:</strong> {medicamento.duracion}</p>
                  </div>
                </div>
                {medicamento.indicaciones && (
                  <div className="mt-2 pt-2 border-t border-green-100">
                    <p><strong>Indicaciones:</strong> {medicamento.indicaciones}</p>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      ) : (
        <SeccionVacia titulo="💉 RECETA MÉDICA" mensaje="No se han prescrito medicamentos para esta consulta" />
      )}

      {/* Exámenes de Laboratorio Solicitados */}
      {ordenesLaboratorio && ordenesLaboratorio.length > 0 ? (
        <div className="mb-6 p-4 bg-blue-50 rounded-lg border border-blue-200 seccion-laboratorio">
          <h3 className="font-semibold text-blue-800 mb-2 border-b border-blue-300">
            🔬 EXÁMENES DE LABORATORIO SOLICITADOS
          </h3>
          <div className="space-y-3">
            {ordenesLaboratorio.map((orden, ordenIndex) => (
              <div key={ordenIndex} className="p-3 bg-white rounded-lg border border-blue-100">
                <div className="flex justify-between items-center mb-2">
                  <span className="inline-block px-2 py-1 bg-blue-100 text-blue-800 text-xs font-semibold rounded">
                    Orden #{orden.id || ordenIndex + 1}
                  </span>
                  <span className="text-xs text-gray-500">
                    {formatearFecha(orden.fecha_solicitud)}
                  </span>
                </div>
                
                {/* Lista de exámenes en esta orden */}
                {orden.examenes && orden.examenes.length > 0 ? (
                  <div className="space-y-2">
                    {orden.examenes.map((examen, examenIndex) => (
                      <div key={examenIndex} className="flex items-center gap-3 p-2 bg-blue-50 rounded border-l-4 border-blue-300">
                        <span className="w-5 h-5 bg-blue-500 text-white text-xs font-bold rounded-full flex items-center justify-center flex-shrink-0">
                          {examenIndex + 1}
                        </span>
                        <div className="flex-1">
                          <p className="font-medium text-sm text-gray-900">{examen.nombre}</p>
                          {examen.descripcion && (
                            <p className="text-xs text-gray-600 mt-1">{examen.descripcion}</p>
                          )}
                          {examen.condicion_paciente && (
                            <p className="text-xs text-amber-600 mt-1">
                              <strong>Condición:</strong> {examen.condicion_paciente}
                            </p>
                          )}
                          {examen.tiempo_resultado && (
                            <p className="text-xs text-green-600 mt-1">
                              <strong>Tiempo estimado:</strong> {examen.tiempo_resultado}
                            </p>
                          )}
                        </div>
                        <div className="text-xs">
                          <span className={`px-2 py-1 rounded-full text-xs ${
                            orden.estado === 'pendiente' 
                              ? 'bg-yellow-100 text-yellow-800'
                              : orden.estado === 'completado'
                              ? 'bg-green-100 text-green-800'
                              : 'bg-gray-100 text-gray-800'
                          }`}>
                            {orden.estado || 'Pendiente'}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-gray-500 italic">No hay exámenes específicos registrados</p>
                )}
              </div>
            ))}
          </div>
        </div>
      ) : (
        <SeccionVacia titulo="🔬 EXÁMENES DE LABORATORIO SOLICITADOS" mensaje="No se han solicitado exámenes de laboratorio para esta consulta" />
      )}

      {/* Pie de página con firma digital */}
      <div className="mt-8 pt-4 border-t-2 border-gray-300">
        <div className="flex justify-between items-end">
          <div className="text-xs text-gray-600">
            <p>Documento generado digitalmente</p>
            <p>Fecha de impresión: {formatearFecha(new Date())} - {formatearHora(new Date())}</p>
          </div>
          
          <div className="text-center pie-firma">
            {/* Firma digital del médico */}
            {medicoInfo?.firma && (
              <div className="mb-4 firma-digital">
                <img 
                  src={medicoInfo.firma} 
                  alt="Firma digital del médico" 
                  className="mx-auto border border-gray-300 rounded bg-white p-1 firma-img-hc"
                />
              </div>
            )}
            
            <div className="border-t-2 border-gray-400 pt-2 min-w-[200px]">
              <p className="font-semibold text-sm">
                Dr(a). {medicoInfo?.nombre} {medicoInfo?.apellido}
              </p>
              <p className="text-xs text-gray-600">CMP: {medicoInfo?.cmp || 'N/A'}</p>
              {medicoInfo?.rne && (
                <p className="text-xs text-gray-600">RNE: {medicoInfo.rne}</p>
              )}
              <p className="text-xs text-gray-600">{medicoInfo?.especialidad}</p>
              
              {/* Mensaje si no hay firma */}
              {!medicoInfo?.firma && (
                <div className="mt-2 mb-4 h-16 flex items-center justify-center border border-dashed border-gray-300 text-xs text-gray-400">
                  [Espacio para firma manual]
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ImpresionHistoriaClinica;
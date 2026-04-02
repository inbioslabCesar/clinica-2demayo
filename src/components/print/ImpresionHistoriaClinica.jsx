import { formatColegiatura, formatProfesionalName } from "../../utils/profesionalDisplay";

const ImpresionHistoriaClinica = ({ 
  paciente, 
  triaje, 
  hc, 
  diagnosticos,
  medicamentos,
  resultadosLaboratorio,
  ordenesLaboratorio,
  medicoInfo,
  configuracionClinica 
}) => {

  // Resolver logo con base URL del servidor PHP
  const resolveLogoUrl = (rawValue) => {
    const raw = String(rawValue || '').trim();
    if (!raw) return '/2demayo.svg';
    if (/^(https?:\/\/|data:|blob:)/i.test(raw)) return raw;
    const isProduction = window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1';
    const base = isProduction ? (window.location.origin.replace(/\/+$/, '') + '/') : 'http://localhost/clinica-2demayo/';
    return `${base}${raw.replace(/^\/+/, '')}`;
  };

  const logoSrc = resolveLogoUrl(configuracionClinica?.logo_url);
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

  const nombrePaciente = paciente?.nombre || paciente?.nombres || '';
  const apellidoPaciente = paciente?.apellido || paciente?.apellidos || '';
  const motivoConsulta = triaje?.motivo || triaje?.motivo_consulta || '';
  const sintomasPrincipales = triaje?.sintomas || triaje?.sintomas_principales || triaje?.sintoma_principal || '';
  const nivelConciencia = triaje?.nivel_conciencia || triaje?.nivelConciencia || '';
  const hidratacion = triaje?.hidratacion || triaje?.estado_hidratacion || '';
  const coloracion = triaje?.coloracion || triaje?.estado_coloracion || '';

  const calcularImc = () => {
    const peso = parseFloat(triaje?.peso);
    const tallaRaw = parseFloat(triaje?.talla);
    if (!Number.isFinite(peso) || !Number.isFinite(tallaRaw) || peso <= 0 || tallaRaw <= 0) return null;
    const tallaEnMetros = tallaRaw <= 3 ? tallaRaw : tallaRaw / 100;
    const imc = peso / Math.pow(tallaEnMetros, 2);
    return Number.isFinite(imc) ? imc.toFixed(1) : null;
  };

  const imcCalculado = calcularImc();
  const tallaNumerica = parseFloat(triaje?.talla);
  const unidadTalla = Number.isFinite(tallaNumerica) && tallaNumerica > 0 && tallaNumerica <= 3 ? 'm' : 'cm';

  const normalizarTexto = (texto) => String(texto || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

  const limpiarPrefijoRepetido = (valor, etiquetas = []) => {
    let limpio = String(valor ?? '').trim();
    etiquetas.forEach((etiqueta) => {
      const txt = String(etiqueta || '').trim();
      if (!txt) return;
      const escapado = txt.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const re = new RegExp(`^${escapado}\\s*[:\\-]\\s*`, 'i');
      limpio = limpio.replace(re, '').trim();
    });
    return limpio;
  };

  const esParametroGenerico = (parametro) => /^item\s*\d+$/i.test(String(parametro || '').trim());

  const isMetaResultKey = (key) => {
    const k = String(key || '');
    return k.endsWith('__imprimir_examen') || k.endsWith('__alarma_activa') || k.endsWith('__alarma_dias');
  };

  const idToNombreExamen = {};
  if (Array.isArray(ordenesLaboratorio)) {
    ordenesLaboratorio.forEach((orden) => {
      if (!Array.isArray(orden?.examenes)) return;
      orden.examenes.forEach((examen) => {
        if (typeof examen === 'object' && examen?.id) {
          idToNombreExamen[String(examen.id)] = examen.nombre || `Examen ${examen.id}`;
        } else if (typeof examen === 'number' || (typeof examen === 'string' && /^\d+$/.test(examen))) {
          idToNombreExamen[String(examen)] = `Examen ${examen}`;
        }
      });
    });
  }

  const resultadosConDatos = Array.isArray(resultadosLaboratorio)
    ? resultadosLaboratorio.filter((resultado) => {
        if (!resultado?.resultados || typeof resultado.resultados !== 'object') return false;
        return Object.entries(resultado.resultados).some(([k, v]) => !isMetaResultKey(k) && v !== null && String(v).trim() !== '');
      })
    : [];

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
      <style>{`
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
      <div className="text-center pb-4 mb-6" style={{ borderBottom: `2px solid ${configuracionClinica?.nombre_color || '#2563eb'}` }}>
        <div className="flex items-center justify-center gap-4 mb-2">
          <img 
            src={logoSrc} 
            alt={configuracionClinica?.nombre_clinica || 'Logo'} 
            className="h-16 w-auto"
          />
          <div>
            <h1 className="text-2xl font-bold" style={{ color: configuracionClinica?.nombre_color || '#1e40af' }}>
              {configuracionClinica?.nombre_clinica || 'MI CLÍNICA'}
            </h1>
            {configuracionClinica?.slogan && (
              <p className="text-sm font-medium" style={{ color: configuracionClinica.slogan_color || '#4b5563' }}>
                {configuracionClinica.slogan}
              </p>
            )}
            <p className="text-sm text-gray-600">
              {configuracionClinica?.direccion || 'Dirección de la clínica'}
            </p>
            <p className="text-sm text-gray-600">
              Tel: {configuracionClinica?.telefono || '123-456-789'} | Email: {configuracionClinica?.email || 'contacto@clinica.com'}
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
            <p><strong>Nombre:</strong> {nombrePaciente} {apellidoPaciente}</p>
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
            <p><strong>Profesional:</strong> {formatProfesionalName(medicoInfo || {})}</p>
            <p><strong>Colegiatura:</strong> {formatColegiatura(medicoInfo || {})}</p>
            {medicoInfo?.rne && <p><strong>RNE:</strong> {medicoInfo.rne}</p>}
            <p><strong>Especialidad:</strong> {medicoInfo?.especialidad}</p>
            <p><strong>Fecha Consulta:</strong> {formatearFecha(paciente?.fecha_consulta)}</p>
          </div>
        </div>
      </div>

      {/* Motivo de consulta desde triaje */}
      {motivoConsulta && (
        <div className="mb-6 p-4 bg-yellow-50 rounded-lg border border-yellow-200">
          <h3 className="font-semibold text-yellow-800 mb-2 border-b border-yellow-300">
            📝 MOTIVO DE CONSULTA
          </h3>
          <p className="text-sm leading-relaxed">{motivoConsulta}</p>
        </div>
      )}

      {/* Síntomas principales desde triaje */}
      {sintomasPrincipales && (
        <div className="mb-6 p-4 bg-orange-50 rounded-lg border border-orange-200">
          <h3 className="font-semibold text-orange-800 mb-2 border-b border-orange-300">
            🩺 SÍNTOMAS PRINCIPALES
          </h3>
          <p className="text-sm leading-relaxed">{sintomasPrincipales}</p>
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
                <strong>Talla:</strong> {triaje.talla} {unidadTalla}
              </div>
            )}
            {imcCalculado && (
              <div>
                <strong>IMC:</strong> {imcCalculado} kg/m²
              </div>
            )}
          </div>
        </div>
      )}

      {/* Estado general del triaje */}
      {(nivelConciencia || hidratacion || coloracion) && (
        <div className="mb-6 p-4 bg-purple-50 rounded-lg border border-purple-200">
          <h3 className="font-semibold text-purple-800 mb-2 border-b border-purple-300">
            👤 ESTADO GENERAL
          </h3>
          <div className="grid grid-cols-3 gap-4 text-sm">
            {nivelConciencia && (
              <div>
                <strong>Conciencia:</strong> {nivelConciencia}
              </div>
            )}
            {hidratacion && (
              <div>
                <strong>Hidratación:</strong> {hidratacion}
              </div>
            )}
            {coloracion && (
              <div>
                <strong>Coloración:</strong> {coloracion}
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
          <div className="bg-white rounded border border-red-100 p-2 text-xs leading-tight space-y-1">
            {diagnosticos.map((diagnostico, index) => (
              <div key={index} className="text-gray-900">
                <span className="font-semibold">{index + 1}.</span>{' '}
                <span className="font-mono">{diagnostico.codigo || 'S/C'}</span>{' '}
                <span>- {diagnostico.descripcion || diagnostico.nombre || 'Sin descripción'}</span>
                <span className="text-gray-600"> ({diagnostico.tipo || 'Principal'})</span>
                {diagnostico.observaciones && String(diagnostico.observaciones).trim() !== '' && (
                  <span className="text-gray-700"> · Obs: {diagnostico.observaciones}</span>
                )}
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
          <div className="bg-white rounded border border-green-100 p-2 text-xs leading-tight space-y-1">
            {medicamentos.map((medicamento, index) => {
              const nombreMed = medicamento?.nombre || medicamento?.medicamento || 'Medicamento sin nombre';
              const codigoMed = medicamento?.codigo ? ` (${medicamento.codigo})` : '';
              const dosis = medicamento?.dosis || '';
              const frecuencia = medicamento?.frecuencia || '';
              const duracion = medicamento?.duracion || '';
              const obs = medicamento?.observaciones || medicamento?.indicaciones || '';

              const detalles = [
                dosis ? `D: ${dosis}` : null,
                frecuencia ? `F: ${frecuencia}` : null,
                duracion ? `T: ${duracion}` : null,
                obs ? `Obs: ${obs}` : null,
              ].filter(Boolean).join(' | ');

              return (
                <div key={index} className="text-gray-900">
                  <span className="font-semibold">{index + 1}.</span>{' '}
                  <span className="font-semibold">{nombreMed}</span>
                  <span className="text-gray-600">{codigoMed}</span>
                  {detalles && <span> - {detalles}</span>}
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        <SeccionVacia titulo="💉 RECETA MÉDICA" mensaje="No se han prescrito medicamentos para esta consulta" />
      )}

      {/* Exámenes de Laboratorio Solicitados (solo si no existen resultados) */}
      {resultadosConDatos.length === 0 && (
        ordenesLaboratorio && ordenesLaboratorio.length > 0 ? (
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
                          </div>
                          <div className="text-xs">
                            {(() => {
                              const estadoOrden = (orden.estado_visual || orden.estado || 'pendiente').toLowerCase();
                              return (
                            <span className={`px-2 py-1 rounded-full text-xs ${
                              estadoOrden === 'pendiente' 
                                ? 'bg-yellow-100 text-yellow-800'
                                : estadoOrden === 'completado'
                                ? 'bg-green-100 text-green-800'
                                : 'bg-gray-100 text-gray-800'
                            }`}>
                              {orden.estado_visual || orden.estado || 'pendiente'}
                            </span>
                              );
                            })()}
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
        )
      )}

      {/* Resultados de laboratorio - formato comprimido */}
      {resultadosConDatos.length > 0 && (
        <div className="mb-4 p-1.5 bg-cyan-50 rounded-lg border border-cyan-200 seccion-laboratorio">
          <h3 className="font-semibold text-cyan-800 mb-0.5 border-b border-cyan-300 text-xs">
            🧪 RESULTADOS DE LABORATORIO
          </h3>
          <div className="space-y-0.5">
            {resultadosConDatos.map((resultado, idx) => {
              const agrupados = {};
              Object.entries(resultado.resultados || {}).forEach(([key, value]) => {
                if (isMetaResultKey(key)) return;
                if (value === null || String(value).trim() === '') return;
                let examId = key;
                let parametro = null;
                if (key.includes('__')) {
                  [examId, parametro] = key.split('__');
                }
                if (!agrupados[examId]) agrupados[examId] = [];
                agrupados[examId].push({ parametro, value });
              });

              return (
                <div key={resultado.id || idx} className="bg-white border border-cyan-100 rounded p-1 text-[11px] leading-tight">
                  <div className="text-[9px] text-gray-600 mb-0.5">
                    Fecha: {formatearFecha(resultado.fecha)} {formatearHora(resultado.fecha)}
                  </div>
                  {(() => {
                    const resumenPorExamen = Object.entries(agrupados).map(([examId, items]) => {
                    const nombreExamen = idToNombreExamen[String(examId)] || `Examen ${examId}`;
                    const partes = items
                      .map(({ parametro, value }) => {
                        const valorLimpio = limpiarPrefijoRepetido(value, [parametro, nombreExamen]);
                        if (!valorLimpio) return '';

                        const parametroNorm = normalizarTexto(parametro);
                        const examenNorm = normalizarTexto(nombreExamen);
                        const valorNorm = normalizarTexto(valorLimpio);

                        const mostrarParametro = Boolean(
                          parametro &&
                          !esParametroGenerico(parametro) &&
                          parametroNorm &&
                          parametroNorm !== examenNorm &&
                          !valorNorm.startsWith(parametroNorm)
                        );

                        return mostrarParametro ? `${parametro}: ${valorLimpio}` : valorLimpio;
                      })
                      .filter(Boolean);

                    const partesUnicas = [...new Set(partes)];
                    if (partesUnicas.length === 0) return '';

                    return `${nombreExamen}: ${partesUnicas.join(' | ')}`;
                  }).filter(Boolean);

                    return (
                      <div className="text-gray-800">
                        {resumenPorExamen.join(' • ')}
                      </div>
                    );
                  })()}
                </div>
              );
            })}
          </div>
        </div>
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
                  className="mx-auto bg-transparent p-0 firma-img-hc"
                />
              </div>
            )}
            
            <div className="border-t-2 border-gray-400 pt-2 min-w-[200px]">
              <p className="font-semibold text-sm">
                {formatProfesionalName(medicoInfo || {})}
              </p>
              <p className="text-xs text-gray-600">{medicoInfo?.especialidad}</p>
              <p className="text-xs text-gray-600">{formatColegiatura(medicoInfo || {})}</p>
              {medicoInfo?.rne && (
                <p className="text-xs text-gray-600">RNE: {medicoInfo.rne}</p>
              )}
              
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
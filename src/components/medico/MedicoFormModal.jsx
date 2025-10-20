

import { useState, useRef } from 'react';

const MedicoFormModal = ({ 
  isOpen, 
  onClose, 
  mode = 'create', // 'create' | 'edit'
  formData,
  onChange,
  onSubmit,
  error,
  isSaving 
}) => {
  const [previewFirma, setPreviewFirma] = useState(formData.firma || null);
  const [firmaError, setFirmaError] = useState('');
  const fileInputRef = useRef(null);
  
  if (!isOpen) return null;

  const handleFileSelect = (event) => {
    const file = event.target.files[0];
    if (!file) return;

    // Validar tipo de archivo
    if (!file.type.match(/^image\/(png|jpeg|jpg)$/)) {
      setFirmaError("Solo se permiten archivos PNG, JPG o JPEG");
      return;
    }

    // Validar tamaño (máximo 2MB)
    if (file.size > 2 * 1024 * 1024) {
      setFirmaError("El archivo es demasiado grande. Máximo 2MB.");
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      const dataUrl = e.target.result;
      setPreviewFirma(dataUrl);
      setFirmaError('');
      // Llamar al onChange del componente padre
      onChange({
        target: {
          name: 'firma',
          value: dataUrl
        }
      });
    };
    reader.readAsDataURL(file);
  };

  const eliminarFirma = () => {
    setPreviewFirma(null);
    setFirmaError('');
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
    // Llamar al onChange del componente padre
    onChange({
      target: {
        name: 'firma',
        value: null
      }
    });
  };

  const isEditMode = mode === 'edit';
  const title = isEditMode ? 'Editar Médico' : 'Registrar Nuevo Médico';
  const subtitle = isEditMode ? 'Actualizar información del médico' : 'Agregar médico al sistema';
  const submitText = isEditMode ? 'Actualizar Médico' : 'Registrar Médico';
  const gradientColor = isEditMode 
    ? 'bg-gradient-to-r from-amber-500 to-orange-600' 
    : 'bg-gradient-to-r from-blue-500 to-purple-600';
  
  const buttonColor = isEditMode
    ? 'bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-600 hover:to-orange-700'
    : 'bg-gradient-to-r from-blue-500 to-purple-600 hover:from-blue-600 hover:to-purple-700';

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-2 sm:p-4">
      <div className="bg-white w-full max-w-md lg:max-w-2xl xl:max-w-3xl rounded-2xl shadow-2xl max-h-[95vh] sm:max-h-[88vh] lg:max-h-[85vh] flex flex-col">
        {/* Header del modal con gradiente */}
        <div className={`${gradientColor} text-white p-4 sm:p-6 rounded-t-2xl flex-shrink-0`}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-white/20 rounded-lg backdrop-blur-sm">
                <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  {isEditMode ? (
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                  ) : (
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  )}
                </svg>
              </div>
              <div>
                <h3 className="text-xl font-bold">{title}</h3>
                <p className="text-white/80 text-sm">{subtitle}</p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-2 hover:bg-white/20 rounded-lg transition-colors"
            >
              <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>
        
        {/* Contenido del formulario con scroll mejorado */}
        <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-2 sm:py-4">
          <form id={`medico-form-${mode}`} onSubmit={onSubmit} className="h-full flex flex-col">
            <div className="flex-1 space-y-4 sm:space-y-6 pb-4">
              {/* Sección: Información Personal */}
              <div className="space-y-4">
                <div className="flex items-center gap-2 mb-4">
                  <svg className="h-5 w-5 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                  </svg>
                  <h4 className="text-lg font-semibold text-gray-800">Información Personal</h4>
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2">
                      <span className="flex items-center gap-2">
                        <svg className="h-4 w-4 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                        </svg>
                        Nombre *
                      </span>
                    </label>
                    <input
                      type="text"
                      name="nombre"
                      value={formData.nombre}
                      onChange={onChange}
                      className="w-full border border-gray-300 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-transparent transition-all duration-200 bg-gray-50 focus:bg-white"
                      placeholder="Juan"
                      required
                    />
                  </div>
                  
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2">
                      <span className="flex items-center gap-2">
                        <svg className="h-4 w-4 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                        </svg>
                        Apellido *
                      </span>
                    </label>
                    <input
                      type="text"
                      name="apellido"
                      value={formData.apellido || ''}
                      onChange={onChange}
                      className="w-full border border-gray-300 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-transparent transition-all duration-200 bg-gray-50 focus:bg-white"
                      placeholder="Pérez García"
                      required
                    />
                  </div>
                </div>
                
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">
                    <span className="flex items-center gap-2">
                      <svg className="h-4 w-4 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
                      </svg>
                      Especialidad *
                    </span>
                  </label>
                  <input
                    type="text"
                    name="especialidad"
                    value={formData.especialidad}
                    onChange={onChange}
                    className="w-full border border-gray-300 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-transparent transition-all duration-200 bg-gray-50 focus:bg-white"
                    placeholder="Cardiología"
                    required
                  />
                </div>
              </div>
              
              {/* Sección: Códigos Profesionales */}
              <div className="space-y-4">
                <div className="flex items-center gap-2 mb-4">
                  <svg className="h-5 w-5 text-purple-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a1 1 0 011-1h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                  <h4 className="text-lg font-semibold text-gray-800">Códigos Profesionales</h4>
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2">
                      <span className="flex items-center gap-2">
                        <svg className="h-4 w-4 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a1 1 0 011-1h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                        </svg>
                        C.M.P. (Colegio Médico del Perú) *
                      </span>
                    </label>
                    <input
                      type="text"
                      name="cmp"
                      value={formData.cmp || ''}
                      onChange={onChange}
                      className="w-full border border-gray-300 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-purple-500/50 focus:border-transparent transition-all duration-200 bg-gray-50 focus:bg-white"
                      placeholder="64201"
                      required
                    />
                    <p className="text-xs text-gray-500 mt-1">Obligatorio para todos los médicos</p>
                  </div>
                  
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2">
                      <span className="flex items-center gap-2">
                        <svg className="h-4 w-4 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
                        </svg>
                        R.N.E. (Registro Nacional de Especialidad)
                      </span>
                    </label>
                    <input
                      type="text"
                      name="rne"
                      value={formData.rne || ''}
                      onChange={onChange}
                      className="w-full border border-gray-300 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-purple-500/50 focus:border-transparent transition-all duration-200 bg-gray-50 focus:bg-white"
                      placeholder="36922"
                    />
                    <p className="text-xs text-gray-500 mt-1">Solo para médicos especialistas</p>
                  </div>
                </div>
              </div>
              
              {/* Sección: Información de Contacto */}
              <div className="space-y-4">
                <div className="flex items-center gap-2 mb-4">
                  <svg className="h-5 w-5 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 4.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                  </svg>
                  <h4 className="text-lg font-semibold text-gray-800">Información de Contacto</h4>
                </div>
                
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">
                    <span className="flex items-center gap-2">
                      <svg className="h-4 w-4 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 12a4 4 0 10-8 0 4 4 0 008 0zm0 0v1.5a2.5 2.5 0 005 0V12a9 9 0 10-9 9m4.5-1.206a8.959 8.959 0 01-4.5 1.207" />
                      </svg>
                      Email *
                    </span>
                  </label>
                  <input
                    type="email"
                    name="email"
                    value={formData.email}
                    onChange={onChange}
                    className="w-full border border-gray-300 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-green-500/50 focus:border-transparent transition-all duration-200 bg-gray-50 focus:bg-white"
                    placeholder="doctor@clinica2demayo.com"
                    required
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">
                    <span className="flex items-center gap-2">
                      <svg className="h-4 w-4 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                      </svg>
                      {isEditMode ? 'Nueva Contraseña' : 'Contraseña de Acceso *'}
                    </span>
                  </label>
                  <input
                    type="password"
                    name="password"
                    value={formData.password}
                    onChange={onChange}
                    className="w-full border border-gray-300 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-green-500/50 focus:border-transparent transition-all duration-200 bg-gray-50 focus:bg-white"
                    placeholder="••••••••"
                    required={!isEditMode}
                    autoComplete={isEditMode ? "new-password" : "new-password"}
                  />
                  {isEditMode && (
                    <p className="text-xs text-gray-500 mt-1">Dejar vacío para mantener la contraseña actual</p>
                  )}
                  {!isEditMode && (
                    <p className="text-xs text-gray-500 mt-1">Mínimo 8 caracteres recomendados</p>
                  )}
                </div>
              </div>
              
              {/* Sección: Firma Digital */}
              <div className="space-y-4">
                <div className="flex items-center gap-2 mb-4">
                  <svg className="h-5 w-5 text-indigo-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h14a2 2 0 002-2V7a2 2 0 00-2-2h-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                  </svg>
                  <h4 className="text-lg font-semibold text-gray-800">✍️ Firma Digital</h4>
                </div>
                
                {/* Vista previa de firma */}
                {previewFirma ? (
                  <div className="bg-white border-2 border-dashed border-indigo-300 rounded-lg p-4 text-center">
                    <img 
                      src={previewFirma} 
                      alt="Firma digital" 
                      className="max-h-32 mx-auto object-contain"
                      style={{ maxWidth: '300px' }}
                    />
                    <div className="mt-3 flex justify-center gap-2">
                      <button
                        type="button"
                        onClick={eliminarFirma}
                        className="px-3 py-1 text-sm bg-red-100 text-red-700 rounded-lg hover:bg-red-200 transition-colors"
                      >
                        🗑️ Eliminar
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="bg-white border-2 border-dashed border-gray-300 rounded-lg p-8 text-center">
                    <svg className="w-12 h-12 text-gray-400 mx-auto mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h14a2 2 0 002-2V7a2 2 0 00-2-2h-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                    </svg>
                    <p className="text-gray-500">No hay firma registrada</p>
                  </div>
                )}
                
                <div className="space-y-3">
                  <label className="block text-sm font-semibold text-gray-700">
                    <span className="flex items-center gap-2">
                      <svg className="h-4 w-4 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                      </svg>
                      Subir Firma Digital
                    </span>
                  </label>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/png,image/jpeg,image/jpg"
                    onChange={handleFileSelect}
                    className="w-full border border-gray-300 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-transparent transition-all duration-200 bg-gray-50 focus:bg-white"
                  />
                  
                  {firmaError && (
                    <div className="text-red-600 text-sm flex items-center gap-2">
                      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      {firmaError}
                    </div>
                  )}
                  
                  <div className="bg-indigo-50 border border-indigo-200 rounded-lg p-3">
                    <div className="text-sm text-indigo-800">
                      <p className="font-medium mb-1">📋 Requisitos de la firma:</p>
                      <ul className="space-y-1 text-indigo-700 text-xs">
                        <li>• Formato: PNG, JPG o JPEG</li>
                        <li>• Tamaño máximo: 2MB</li>
                        <li>• Recomendado: Fondo transparente</li>
                        <li>• Dimensiones sugeridas: 300x100 píxeles</li>
                      </ul>
                    </div>
                  </div>
                </div>
                
                {/* Vista previa del resultado final */}
                {(formData.nombre || formData.apellido || formData.cmp || previewFirma) && (
                  <div className="bg-blue-50 rounded-xl p-4">
                    <h5 className="text-sm font-semibold text-gray-800 mb-3 flex items-center gap-2">
                      <svg className="w-4 h-4 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                      </svg>
                      Vista Previa - Así aparecerá en los documentos
                    </h5>
                    
                    <div className="bg-white border-2 border-blue-200 rounded-lg p-3 text-center">
                      {previewFirma && (
                        <img 
                          src={previewFirma} 
                          alt="Firma" 
                          className="max-h-12 mx-auto object-contain mb-2"
                        />
                      )}
                      <div className="border-t-2 border-gray-300 pt-2">
                        <div className="text-sm font-medium text-gray-800">
                          {formData.nombre} {formData.apellido}
                        </div>
                        {formData.especialidad && (
                          <div className="text-xs text-gray-600">
                            {formData.especialidad}
                          </div>
                        )}
                        <div className="text-xs text-gray-600">
                          {formData.cmp && `C.M.P. ${formData.cmp}`}
                          {formData.rne && ` - R.N.E ${formData.rne}`}
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </form>
        </div>
        
        {/* Error de validación fuera del scroll */}
        {error && (
          <div className="mx-4 sm:mx-6 mb-4">
            <div className="bg-red-50 border border-red-200 rounded-xl p-4">
              <div className="flex items-center gap-2">
                <svg className="h-5 w-5 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span className="text-red-700 font-medium">{error}</span>
              </div>
            </div>
          </div>
        )}
        
        {/* Botones de acción siempre visibles */}
        <div className="flex flex-col sm:flex-row gap-3 p-4 sm:p-6 border-t border-gray-200 bg-gray-50/50 rounded-b-2xl flex-shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 px-6 py-3 rounded-xl bg-gray-100 text-gray-700 hover:bg-gray-200 transition-all duration-200 font-medium flex items-center justify-center gap-2"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
            Cancelar
          </button>
          <button
            type="submit"
            form={`medico-form-${mode}`}
            disabled={isSaving}
            className={`flex-1 px-6 py-3 rounded-xl ${buttonColor} text-white disabled:from-gray-400 disabled:to-gray-500 disabled:cursor-not-allowed transition-all duration-200 font-medium flex items-center justify-center gap-2`}
          >
            {isSaving ? (
              <>
                <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="m4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                Guardando...
              </>
            ) : (
              <>
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  {isEditMode ? (
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                  ) : (
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  )}
                </svg>
                {submitText}
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

export default MedicoFormModal;
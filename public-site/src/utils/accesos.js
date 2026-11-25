/**
 * Accesos de la clínica según los servicios que tenga activos.
 * El acceso del personal (médicos y demás) siempre existe y conserva su URL de siempre.
 * @param {string} sistemaUrl URL del sistema terminada en "/"
 * @param {{pacientes?: boolean, empresas?: boolean}} portales
 */
export function accesosDisponibles(sistemaUrl, portales = {}) {
  const accesos = []
  if (portales.pacientes) {
    accesos.push({ clave: 'paciente', titulo: 'Paciente', detalle: 'Resultados de laboratorio e imágenes', href: `${sistemaUrl}resultados` })
  }
  accesos.push({ clave: 'personal', titulo: 'Médico o personal', detalle: 'Acceso interno de la clínica', href: sistemaUrl })
  if (portales.empresas) {
    accesos.push({ clave: 'empresa', titulo: 'Empresa', detalle: 'Certificados de salud ocupacional', href: `${sistemaUrl}?acceso=empresa` })
  }
  return accesos
}

export function hayAccesosExternos(portales = {}) {
  return Boolean(portales.pacientes || portales.empresas)
}

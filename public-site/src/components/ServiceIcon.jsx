import React from 'react'
import {
  FaStethoscope,
  FaMicroscope,
  FaXRay,
  FaWaveSquare,
  FaProcedures,
  FaHospital,
  FaNotesMedical,
} from 'react-icons/fa'

function normalizeKey(value) {
  return (value || '')
    .toString()
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '')
    .replace(/[-_]/g, '')
}

const ICON_MAP = {
  consultas: FaStethoscope,
  consulta: FaStethoscope,
  medico: FaStethoscope,

  laboratorio: FaMicroscope,
  lab: FaMicroscope,

  rayosx: FaXRay,
  rayos: FaXRay,
  rx: FaXRay,

  ecografias: FaWaveSquare,
  ecografia: FaWaveSquare,
  eco: FaWaveSquare,

  operaciones: FaProcedures,
  operacion: FaProcedures,
  cirugia: FaProcedures,

  hospitalizacion: FaHospital,
  hospital: FaHospital,
}

export default function ServiceIcon({ name, className }) {
  const key = normalizeKey(name)
  const Icon = ICON_MAP[key] || FaNotesMedical
  return <Icon className={className} aria-hidden="true" focusable="false" />
}

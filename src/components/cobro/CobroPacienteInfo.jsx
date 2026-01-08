// Muestra información del paciente
export default function CobroPacienteInfo({ paciente }) {
  return (
    <div className="bg-gray-50 p-4 rounded mb-4">
      <h4 className="font-semibold mb-2">Paciente:</h4>
      <p>{paciente?.nombre}</p>
      <p>DNI: {paciente?.dni} | H.C.: {paciente?.historia_clinica}</p>
    </div>
  );
}

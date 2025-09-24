import React from "react";
import { useParams } from "react-router-dom";
import PacienteConsumosPage from "./PacienteConsumosPage";

function PacienteConsumosRoutePage() {
  const { id } = useParams();
  return <PacienteConsumosPage pacienteId={id} />;
}

export default PacienteConsumosRoutePage;

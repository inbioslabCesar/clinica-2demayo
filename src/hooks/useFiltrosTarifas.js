import { useState } from "react";

export function useFiltrosTarifas() {
  const [filtroMedico, setFiltroMedico] = useState("");
  const [filtroDescripcion, setFiltroDescripcion] = useState("");
  const [filtroServicio, setFiltroServicio] = useState("todos");

  return {
    filtroMedico,
    setFiltroMedico,
    filtroDescripcion,
    setFiltroDescripcion,
    filtroServicio,
    setFiltroServicio,
  };
}

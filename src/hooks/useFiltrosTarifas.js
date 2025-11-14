import { useState } from "react";

export function useFiltrosTarifas() {
  const [filtroMedico, setFiltroMedico] = useState("");
  const [filtroServicio, setFiltroServicio] = useState("todos");

  return {
    filtroMedico,
    setFiltroMedico,
    filtroServicio,
    setFiltroServicio,
  };
}

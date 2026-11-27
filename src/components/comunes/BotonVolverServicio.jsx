import { useNavigate } from "react-router-dom";
import BotonVolver from "./BotonVolver";
import { destinoVolverServicio } from "../../utils/destinoVolverServicio";

/** «Volver» de los módulos de servicio: misma apariencia y misma regla de destino en todos. */
export default function BotonVolverServicio({ pacienteId, pacienteTemporal, cotizacionId, cobroId, modo, className }) {
  const navigate = useNavigate();
  const destino = destinoVolverServicio({ pacienteId, pacienteTemporal, cotizacionId, cobroId, modo });
  return (
    <BotonVolver
      ariaLabel={destino.ariaLabel}
      className={className}
      onClick={() => navigate(destino.to, destino.options)}
    >
      {destino.etiqueta}
    </BotonVolver>
  );
}

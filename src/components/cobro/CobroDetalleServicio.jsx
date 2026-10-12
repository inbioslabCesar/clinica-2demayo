// Lista y resumen de servicios a cobrar
export default function CobroDetalleServicio({ detalles, total }) {
  const safeDetalles = Array.isArray(detalles) ? detalles : [];
  const leerSnapshot = (detalle) => {
    const raw = detalle?.snapshot_json;
    if (!raw) return null;
    if (typeof raw === "object") return raw;
    if (typeof raw === "string") {
      try {
        const parsed = JSON.parse(raw);
        return parsed && typeof parsed === "object" ? parsed : null;
      } catch {
        return null;
      }
    }
    return null;
  };

  const resumenSoloPaquete = (() => {
    const evaluables = safeDetalles.filter((d) => Number(d?.subtotal || 0) > 0);
    if (evaluables.length === 0) return null;
    const esPaquete = evaluables.every((detalle) => {
      const snap = leerSnapshot(detalle);
      const paqueteId = Number(detalle?.paquete_id || snap?.paquete_id || 0);
      const paqueteCodigo = String(detalle?.paquete_codigo || snap?.paquete_codigo || "").trim();
      const paqueteTipo = String(detalle?.paquete_tipo || snap?.paquete_tipo || "").trim().toLowerCase();
      const descripcion = String(detalle?.descripcion || "").toLowerCase();
      const soloDif = Number(detalle?.solo_cobro_diferencia || detalle?._lectura_comercial_paquete || 0) === 1
        || descripcion.includes("diferencia pendiente del paquete")
        || descripcion.includes("pago de diferencia de paquete");
      return soloDif || paqueteId > 0 || paqueteCodigo !== "" || paqueteTipo === "paquete" || paqueteTipo === "perfil";
    });
    if (!esPaquete) return null;

    const first = evaluables[0] || {};
    const snapFirst = leerSnapshot(first);
    const nombre = String(first?.paquete_nombre || snapFirst?.paquete_nombre || first?.paquete_codigo || snapFirst?.paquete_codigo || "PAQUETE").trim();
    return { nombre: nombre || "PAQUETE" };
  })();

  return (
    <div className="mb-4">
      <h4 className="font-semibold mb-2">Detalle del Servicio:</h4>
      <div className="bg-blue-50 p-4 rounded">
        {resumenSoloPaquete ? (
          <div className="flex justify-between items-center">
            <span>{resumenSoloPaquete.nombre}</span>
            <span className="font-bold">S/ {Number(total || 0).toFixed(2)}</span>
          </div>
        ) : safeDetalles.map((detalle, index) => {
          let precio = detalle.subtotal;
          if ((typeof precio !== 'number' || precio <= 0) && typeof detalle.precio_publico === 'number') {
            precio = detalle.precio_publico;
          }
          return (
            <div key={index} className="flex justify-between items-center">
              <span>{detalle.descripcion}</span>
              <span className="font-bold">S/ {precio > 0 ? precio.toFixed(2) : '—'}</span>
            </div>
          );
        })}
        <hr className="my-2" />
        <div className="flex justify-between items-center font-bold text-lg">
          <span>TOTAL:</span>
          <span className="text-green-600">S/ {total.toFixed(2)}</span>
        </div>
      </div>
    </div>
  );
}

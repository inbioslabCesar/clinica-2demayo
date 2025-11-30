// Lista y resumen de servicios a cobrar
export default function CobroDetalleServicio({ detalles, total }) {
  return (
    <div className="mb-4">
      <h4 className="font-semibold mb-2">Detalle del Servicio:</h4>
      <div className="bg-blue-50 p-4 rounded">
        {detalles.map((detalle, index) => {
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

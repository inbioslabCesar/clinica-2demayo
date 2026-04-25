# SQL Flujo Perfiles/Paquetes

## Orden de ejecucion sugerido
1. `01_precheck_flujo_perfiles.sql`
2. `02_schema_paquetes_perfiles.sql`
3. `03_reglas_honorario_paquete.sql`
4. `04_verificacion_flujo_perfiles.sql`

## Notas
- Scripts idempotentes para desarrollo.
- No eliminan ni alteran flujos actuales de cotizaciones/cobros/honorarios/laboratorio.
- Ejecutar primero en entorno de desarrollo y luego en produccion.

## Politicas funcionales confirmadas (fase actual)
1. Descuento global de paquete:
- Se distribuye proporcionalmente por subtotal de cada servicio del paquete.

2. Farmacia en paquete:
- No reserva stock al cotizar.
- Descarga/reserva stock solo al cobrar.

3. Honorarios medicos en paquete:
- Default: usar configuracion pactada actual del medico.
- Se permite override por item de paquete para acuerdos de volumen.
- El override aplica solo en paquetes.

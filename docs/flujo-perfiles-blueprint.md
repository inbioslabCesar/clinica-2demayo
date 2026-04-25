# Flujo Paquetes/Perfiles - Blueprint de Implementacion

## Objetivo
Implementar un flujo de `Paquetes/Perfiles` separado de tarifas simples, integrado con cotizacion/venta, honorarios medicos y liquidacion de laboratorio de referencia.

## Alcance de esta fase
- Paquete = venta cerrada (precio global comercial).
- Sin contratos, sin cronogramas, sin cuenta corriente avanzada.
- Integracion con flujo actual de cotizaciones/cobros sin romper modulos existentes.

## Matriz Evento -> Impacto de datos
1. Crear paquete/perfil:
- `paquetes_perfiles` (cabecera).
- `paquetes_perfiles_items` (componentes de servicios, laboratorio, farmacia, etc.).
- `paquetes_perfiles_items_honorario_reglas` (solo si hay excepcion de honorario en paquete).

2. Agregar paquete al carrito/cotizador:
- No crea honorarios ni movimientos de laboratorio aun.
- Solo arma una linea comercial y prepara detalle operativo interno.

3. Registrar cotizacion (sin cobrar):
- Se registra paquete como entidad comercial (cabecera de cotizacion).
- Se guarda snapshot de componentes para trazabilidad operativa.
- Si hay laboratorio tercerizado, puede quedar pendiente con `cobro_id = 0` y posterior enlace por cobro.

4. Registrar y cobrar:
- Venta comercial de paquete (precio global).
- Descomposicion operativa por item para disparar:
  - honorarios medicos por item aplicable,
  - laboratorio referencia por item derivado,
  - farmacia (stock/consumo) segun regla vigente.

5. Liquidacion honorarios:
- Usa flujo actual de `honorarios_medicos_movimientos`.
- Regla por defecto: configuracion normal del medico.
- Regla especial de paquete solo si esta definida para el item.

6. Liquidacion laboratorio de referencia:
- Usa `laboratorio_referencia_movimientos` actual.
- Debe conservar `tipo_derivacion`, `valor_derivacion`, laboratorio y monto por item.

7. Anular cotizacion/venta de paquete:
- Reversa comercial y operativa.
- Cancelar/revertir honorarios pendientes vinculados.
- Revertir o cancelar movimientos de laboratorio referencia vinculados.

## Reglas de honorario (definitivas)
1. Sin paquete: aplica configuracion normal pactada del medico.
2. Con paquete: aplica configuracion normal, salvo override explicito del item.
3. Paquete con multiples medicos: cada item liquida por separado.
4. Descuento global del paquete no debe mezclar honorarios entre medicos.

## Decisiones funcionales confirmadas
1. Reparto de descuento global del paquete:
- Metodo confirmado: distribucion proporcional por subtotal de cada componente.
- Objetivo: mantener trazabilidad clara de base por item para honorarios y margenes.

2. Politica de farmacia en paquete:
- Metodo confirmado: no reservar stock al cotizar.
- El movimiento de stock se ejecuta al cobrar (venta efectiva).
- Objetivo: evitar bloqueos de inventario por cotizaciones no concretadas.

3. Honorarios medicos en paquete:
- Regla general: cada medico mantiene su porcentaje/monto pactado normal.
- Excepcion permitida: en paquetes de mayor volumen se puede configurar un acuerdo economico especifico por item del paquete.
- Alcance: el override aplica solo dentro del paquete; fuera del paquete se mantiene la regla normal del medico.

## Riesgos funcionales a blindar
1. Duplicado al pasar de cotizacion a cobro (especialmente laboratorio referencia).
2. Inconsistencia de nombres de campo laboratorio en API/UI.
3. Reglas ambiguas de reparto del descuento global entre items.
4. Ventas historicas alteradas por cambios futuros de composicion (usar snapshot).

## Decisiones minimas pendientes (go-live)
1. Definir UX de captura para override de honorario en paquete por item:
- `usar_configuracion_medico` (default),
- `monto_fijo_medico_paquete`,
- `porcentaje_medico_paquete`.

## Criterio de salida de esta fase
- Paquete vendible en cotizador.
- Trazabilidad completa comercial + operativa.
- Liquidaciones existentes siguen funcionando sin cambios de comportamiento fuera de paquetes.

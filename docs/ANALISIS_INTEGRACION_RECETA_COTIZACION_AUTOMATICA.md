# Analisis de Integracion: Receta Medica -> Cotizacion Automatica

## 1) Objetivo
Eliminar el flujo manual de hoja impresa entre Historia Clinica (HC) y Cotizaciones/Farmacia.

Meta de negocio:
- Cuando el medico finaliza HC y existe receta, los medicamentos deben aparecer automaticamente en una sola cotizacion (modo carrito).
- Al cobrarse, esos items deben contabilizarse como produccion medica del medico tratante.

## 2) Estado actual validado en el sistema

### 2.1 Donde se guarda la receta en HC
- Fuente primaria: `historia_clinica.datos` (JSON), campo `receta`.
- El guardado/actualizacion de HC se realiza en `api_historia_clinica.php` (POST) y persiste `datos` completos.

### 2.2 Snapshot clinico para enfermeria
- Existe `tratamientos_enfermeria.receta_snapshot` como copia de receta por version.
- Util para auditoria clinica, no ideal como fuente comercial principal.

### 2.3 Forma actual de item de receta
Desde UI de HC (selector de medicamentos), cada item suele incluir:
- `codigo`
- `nombre`
- `dosis`
- `frecuencia`, `frecuencia_tipo`, `frecuencia_valor`, `frecuencia_horas`
- `duracion`, `duracion_valor`, `duracion_unidad`
- `observaciones`
- `manual` / `origen` (catalogo o manual)

### 2.4 Cotizaciones ya soporta modo carrito
- `api_cotizaciones.php` ya recibe arreglo `detalles` y crea 1 cotizacion con N filas en `cotizaciones_detalle`.
- Por lo tanto, no se requiere rediseñar el modelo base de cotizacion para este caso.

### 2.5 Trazabilidad de produccion medica
- `cotizaciones_detalle` puede persistir `consulta_id` y `medico_id` si llegan en payload.
- El dashboard de produccion usa `produccion_medica_detalle` alimentado al cobrar.
- Clasificacion actual: si item tiene `consulta_id` o `medico_id` => `produccion_medica`; si no, `venta_directa`.

### 2.6 Stock de farmacia hoy
- El descuento real de stock se ejecuta al cobrar (modulo de farmacia en flujo de cobro).
- Existe una funcion de reserva de stock en cotizaciones, pero actualmente no esta conectada al flujo principal.

## 3) Propuesta de arquitectura funcional (sin codigo)

## 3.1 Patron general
Implementar un "puente HC -> Cotizacion" orientado a evento de guardado/finalizacion de HC.

Evento disparador:
- POST exitoso de `api_historia_clinica.php` cuando exista `datos.receta` con al menos 1 item.

Comportamiento:
1. Leer `consulta_id` actual.
2. Resolver `medico_id` desde `consultas`.
3. Transformar receta clinica a `detalles` de cotizacion tipo `farmacia`.
4. Crear/actualizar una cotizacion unica por consulta (modo carrito).
5. Marcar origen de la cotizacion como automatica de HC.

## 3.2 Regla de agrupacion (modo carrito)
Unidad de agrupacion recomendada:
- 1 `consulta_id` activa + 1 "snapshot de receta vigente" -> 1 `cotizacion_id` abierta.

Reglas:
- Si no existe cotizacion abierta para esa consulta: crear nueva.
- Si existe pendiente/parcial: actualizar detalles (reemplazo controlado).
- Si ya esta pagada: crear nueva cotizacion de receta (adenda funcional).
- Nunca crear 1 cotizacion por medicamento; siempre 1 cotizacion con multiples filas.

## 3.3 Idempotencia y control de duplicados
Para evitar duplicados por multiples guardados de HC:
- Generar `receta_hash` canonico del array de receta (normalizado).
- Guardar referencia de ultima sincronizacion por consulta.
- Si el hash no cambia, no generar nuevas filas.

## 4) Mapeo de datos HC -> Cotizacion

## 4.1 Mapeo minimo de cada item receta a detalle comercial
Para cada medicamento de receta:
- `servicio_tipo` = `farmacia`
- `servicio_id` = `medicamentos.id` (si existe en catalogo)
- `descripcion` = nombre + presentacion operacional
- `cantidad` = cantidad comercial definida por farmacia
- `precio_unitario` = precio vigente del medicamento
- `subtotal` = `cantidad * precio_unitario`
- `consulta_id` = consulta de origen
- `medico_id` = medico de la consulta

## 4.2 Reglas de mapeo catalogo/manual
- Item de catalogo: se puede cotizar automatico.
- Item manual (sin id de medicamento):
  - Opcion A (recomendada): no bloquear HC, pero marcar como `pendiente_validacion_farmacia` y no incluirlo en cotizacion automatica hasta mapeo.
  - Opcion B: incluir como item sin stock (solo informativo), pero no apto para cobro farmacia real.

Recomendacion final: Opcion A por integridad de inventario y para evitar errores en caja.

## 5) Produccion medica: garantia de trazabilidad al dashboard

Condiciones obligatorias:
1. Todo detalle de receta automatica debe persistir `consulta_id` y `medico_id` en `cotizaciones_detalle`.
2. El flujo de cobro no debe perder esos campos en el payload de detalles.
3. Mantener `cotizacion_detalle_id` durante cobro para auditoria fina por item.

Resultado esperado:
- Al pagar, `produccion_medica_detalle` clasificara esos medicamentos como `produccion_medica`.
- El ranking por medico en dashboard mostrara esos montos bajo el medico tratante.

## 6) Stock: propuesta operativa no bloqueante para medico

Principio de negocio:
- El acto medico no se bloquea por inventario.

Modelo recomendado:
1. En HC: sin validacion dura de stock.
2. En creacion automatica de cotizacion: validacion blanda (mostrar disponibilidad y alertas).
3. En cobro: validacion dura transaccional (stock real y descuento).
4. Reserva de stock: opcional fase 2; solo si negocio necesita proteger inventario para tiempos de espera altos.

Ventaja:
- No se detiene atencion clinica.
- Se conserva control de inventario en el punto financiero/logistico correcto.

## 7) Historias de usuario (MVP)

### HU-01 Medico
Como medico, al guardar/finalizar una HC con receta, quiero que se genere automaticamente una cotizacion de farmacia para evitar transcripcion manual.

Criterios de aceptacion:
- Dado una HC con receta valida, cuando guardo/finalizo, entonces existe una cotizacion asociada a la consulta.
- Dado que la receta tiene N medicamentos validos, entonces la cotizacion tiene N detalles.
- Dado que guardo nuevamente sin cambios, entonces no se duplican items.

### HU-02 Recepcion/Farmacia
Como recepcionista o quimico, quiero ver la cotizacion automatica de receta lista para gestionar cobro.

Criterios de aceptacion:
- La cotizacion aparece en listado con identificador de origen HC.
- Se muestra vinculada al paciente y consulta correcta.
- Los items con mapeo pendiente se identifican claramente como no cobrables hasta validacion.

### HU-03 Caja
Como caja, quiero cobrar la cotizacion de receta conservando trazabilidad clinica.

Criterios de aceptacion:
- Al cobrar, cada item mantiene `consulta_id` y `medico_id`.
- El cobro no pierde `cotizacion_detalle_id`.
- Si no hay stock en ese momento, se bloquea solo el item afectado con mensaje claro.

### HU-04 Administracion
Como administrador, quiero que el dashboard refleje esos medicamentos como produccion del medico tratante.

Criterios de aceptacion:
- Tras cobro exitoso, los montos aparecen en `produccion_medica_detalle` con clasificacion `produccion_medica`.
- En dashboard del periodo, el ranking de medico suma esos items.
- No deben aparecer como `venta_directa` si tienen metadatos clinicos.

## 8) Casos de borde y decisiones

1. Receta editada despues de crear cotizacion:
- Si cotizacion pendiente/parcial: actualizar detalle sincronizado.
- Si pagada: crear nueva cotizacion incremental para diferencia.

2. Medicamento inactivo o inexistente:
- Registrar incidencia de mapeo y excluir item de cobro automatico.

3. Cambio de medico en consulta:
- Fuente de verdad para trazabilidad: medico actual de la consulta al momento de sincronizar.

4. Concurrencia de guardados:
- Usar llaves de idempotencia por consulta + hash receta + estado de cotizacion.

## 9) UAT por rol (plan de pruebas)

## 9.1 Medico
- Caso M1: receta con 3 items catalogo -> se genera 1 cotizacion con 3 detalles.
- Caso M2: guardar HC dos veces sin cambios -> no duplica cotizacion/items.
- Caso M3: receta con item manual -> no falla guardado HC; item queda pendiente de validacion.

## 9.2 Recepcion/Farmacia
- Caso R1: visualizar cotizacion automatica con origen HC y paciente correcto.
- Caso R2: validar que los 3 items se vean en una sola cotizacion.
- Caso R3: item pendiente de mapeo no se permite cobrar hasta resolver.

## 9.3 Caja
- Caso C1: cobro exitoso de cotizacion de receta con stock suficiente.
- Caso C2: stock insuficiente en 1 item -> mensaje y manejo de excepcion sin corromper otros items.
- Caso C3: verificar trazabilidad en `cobros_detalle` + metadatos clinicos por item.

## 9.4 Administracion
- Caso A1: dashboard del mes suma medicamentos cobrados dentro de produccion medica.
- Caso A2: ranking de medico muestra incremento del medico tratante.
- Caso A3: ranking venta directa no debe incluir esos items con metadatos clinicos.

## 10) Indicadores de exito
- Reduccion de tiempo de transcripcion manual de receta -> cotizacion.
- Porcentaje de recetas HC convertidas en cotizacion automatica.
- Porcentaje de items receta clasificados correctamente en produccion medica.
- Tasa de errores por mapeo de medicamento manual/no catalogado.

## 11) Alcance por fases

Fase 1 (MVP):
- Generacion automatica de cotizacion desde receta HC.
- Modo carrito (1 cotizacion, multiples detalles).
- Trazabilidad medico/consulta completa hasta dashboard.
- Validacion de stock dura solo en cobro.

Fase 2:
- Reserva de stock opcional por ventana temporal.
- Motor de equivalencias para medicamentos manuales.
- Tablero de excepciones de mapeo farmacia.

## 12) Riesgos y mitigaciones

1. Riesgo: items manuales no catalogados.
- Mitigacion: cola de pendientes de mapeo y exclusiones controladas de cobro.

2. Riesgo: duplicados por guardados repetidos.
- Mitigacion: hash de receta + idempotencia por consulta.

3. Riesgo: perdida de metadatos clinicos en cobro.
- Mitigacion: contrato estricto de payload y validaciones de integridad previas al registro de produccion.

4. Riesgo: percepcion de "falta de stock" como error medico.
- Mitigacion: separar claramente prescripcion clinica (siempre permitida) de despacho comercial (validado en caja/farmacia).

## 13) Conclusiones
- El sistema actual ya tiene piezas base para implementar rapidamente este flujo sin rediseno mayor.
- La ruta de menor friccion es: receta JSON en HC -> transformacion a detalles farmacia -> cotizacion unica por consulta -> cobro con metadatos clinicos -> dashboard.
- La clave para lograr 100% de trazabilidad es preservar `consulta_id` y `medico_id` por item en toda la cadena.

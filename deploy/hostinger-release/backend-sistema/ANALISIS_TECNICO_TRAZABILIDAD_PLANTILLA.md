# Analisis Tecnico: Trazabilidad Inmutable Basada en Plantilla

Fecha: 2026-05-02
Contexto: Flujo de contratos INBIOSLAB
Objetivo: Que el origen medico y de consulta se defina por la plantilla del contrato y se herede de forma inmutable al vender al paciente.

## 1) Problema Actual

En el flujo actual, el medico del servicio no se persiste en la definicion del item de plantilla. Al vender el contrato, el sistema intenta inferir medico y consulta desde fuentes secundarias (consulta activa, cotizacion previa, tarifas), lo que rompe la trazabilidad de origen de la venta.

Sintoma funcional observado:
- En venta de contrato aparecen valores como "No detectado".
- El medico final puede no coincidir con el medico definido operativamente en la configuracion comercial del plan.

## 2) Principio de Diseno

La plantilla es la verdad de negocio.

Regla principal:
- Cada item de plantilla define explicitamente el medico responsable.
- Al crear contrato_paciente, cada item heredado copia ese medico sin heuristicas.
- La analitica y produccion consumen solo ese origen persistido.

Resultado buscado:
- Trazabilidad inmutable desde plantilla hasta produccion.
- Cero dependencia de ingreso manual de medico o consulta en la venta.

## 3) Modelo de Datos Objetivo

### 3.1 Tabla contratos_plantillas_items

Agregar campos:
- medico_id (nullable, FK a medicos.id)
- medico_nombre_snapshot (nullable)
- medico_cmp_snapshot (nullable)

Motivo:
- medico_id permite relacion viva para validacion.
- snapshots congelan evidencia historica de la definicion comercial al momento de guardar plantilla.

### 3.2 Tabla contratos_paciente_servicios

Mantener uso de:
- medico_origen_id
- medico_origen_nombre_snapshot
- medico_origen_cmp_snapshot
- consulta_origen_id
- servicio_nombre_snapshot

Regla:
- Estos campos se llenan por copia directa desde plantilla y su agenda/consulta derivada, no por busqueda de consulta activa ni cotizacion.

### 3.3 Tabla produccion_contrato_detalle

Mantener propagacion:
- medico_id y medico_origen_id vienen de contratos_paciente_servicios.
- consulta_origen_id viene del servicio del contrato.
- snapshots de medico y servicio se conservan para auditoria.

## 4) Flujo Objetivo de Guardado

## Paso A: Guardar plantilla
- Persistir medico_id por item de plantilla.
- Persistir snapshot de medico en item de plantilla.

## Paso B: Vender contrato al paciente
- Leer items de la plantilla con medico_id y snapshots.
- Insertar contratos_paciente_servicios copiando:
  - medico_origen_id = medico_id de item plantilla
  - medico_origen_nombre_snapshot y cmp desde item plantilla
  - servicio_nombre_snapshot desde descripcion_snapshot del item
- No usar consulta activa, cotizacion previa ni tarifas para definir medico de origen.

## Paso C: Generacion de agenda
- Crear agenda_contrato por item de plantilla.
- El evento de agenda conserva referencia a plantilla_item_id.

## Paso D: Generacion de consulta
- Estrategia recomendada: crear consulta automaticamente cuando el item sea de tipo consulta y exista fecha programada.
- Si no se crea en ese momento, reservar linkage y crearla al confirmar/atender, pero siempre vinculada al medico heredado de plantilla.

## Paso E: Produccion y analitica
- Al registrar consumo/atencion, la fuente de medico y origen debe ser contratos_paciente_servicios.
- Evitar recalculo por fuentes externas para no romper inmutabilidad.

## 5) Matriz de Impacto por Accion API

### accion: guardar_plantilla
Cambios:
- Entrada de cada item debe incluir medico_id.
- Validar que medico_id exista en medicos cuando sea mayor a 0.
- Guardar snapshot de medico en item plantilla.

Riesgo si no se cambia:
- Se mantiene la ambiguedad de origen medico en la venta.

### accion: plantillas (listado y detalle)
Cambios:
- Devolver medico_id y snapshots del propio item de plantilla.
- Dejar de reconstruir medico principal desde tarifas como fuente primaria.

Riesgo si no se cambia:
- UI mostrara medicos distintos a la definicion real del plan.

### accion: resolver_origen_automatico
Cambios:
- Reenfocar para reporte informativo, no para decidir medico origen.
- Fuente primaria de medico por item: plantilla.

Riesgo si no se cambia:
- Persistira dependencia de consulta activa/cotizacion para origen.

### accion: guardar_contrato_paciente
Cambios:
- Al insertar contratos_paciente_servicios, copiar medico por item de plantilla.
- Eliminar inferencias de medico desde cotizacion/consulta para esta decision.
- Definir consulta_origen_id desde agenda/consulta derivada del item (no desde heuristica externa).

Riesgo si no se cambia:
- Trazabilidad mutable y posibles discrepancias medico-servicio.

### accion: actualizar_evento_agenda (atencion/ejecucion)
Cambios:
- Si requiere crear consulta en este momento, usar medico heredado del item plantilla via contratos_paciente_servicios.

Riesgo si no se cambia:
- Produccion puede terminar asociada a medico no definido por la venta.

### accion: registrar analitica de consumo
Cambios:
- Confirmar que medico_id y medico_origen_id se prioricen desde contratos_paciente_servicios.
- Mantener snapshots como evidencia historica.

Riesgo si no se cambia:
- Reporteria con variacion segun contexto operativo y no segun contrato vendido.

## 6) Tablas que Deben Consultarse en Guardado

Respuesta tecnica solicitada:

Tablas minimas necesarias para persistir correctamente medico de plantilla hacia contratos_paciente_servicios y luego a produccion_contrato_detalle:
- contratos_plantillas_items: fuente primaria del medico por item.
- medicos: validacion de FK y captura de snapshot (nombre, cmp).
- contratos_paciente_servicios: almacenamiento de origen inmutable heredado.
- agenda_contrato: puente temporal por item y fecha para ejecucion.
- consultas: si se crea consulta automatica o diferida.
- produccion_contrato_detalle: destino final de trazabilidad para analitica.

Tablas que deben dejar de ser fuente primaria de decision de medico origen en este flujo:
- cotizaciones
- cotizaciones_detalle
- tarifas

## 7) Reglas de Integridad

- Si item plantilla tiene medico_id invalido, bloquear guardado de plantilla o marcar error por item.
- Si plantilla activa contiene items sin medico_id en tipos que lo requieren (consulta, ecografia, procedimiento), bloquear venta de contrato o advertir segun politica.
- Nunca sobreescribir medico_origen_id de contratos_paciente_servicios con datos de contexto posterior.

## 8) Compatibilidad y Migracion de Datos

Para plantillas ya existentes:
- Backfill inicial opcional desde reglas actuales solo para pre-carga.
- Recomendacion operativa: validacion manual asistida antes de activar bloqueo estricto.

Fases sugeridas:
1. Agregar columnas en plantilla items.
2. Exponer y guardar medico por item en UI/API de plantilla.
3. Cambiar guardado de contrato para herencia directa.
4. Ajustar generacion de consulta automatica por agenda.
5. Endurecer validaciones para evitar ventas sin medico definido.

## 9) Criterios de Aceptacion

- Al seleccionar plantilla en venta, cada item tiene medico definido desde plantilla.
- Al guardar contrato, contratos_paciente_servicios conserva medico_origen_id igual al medico del item plantilla.
- Al generar/ejecutar consulta de agenda, consulta queda asociada al mismo medico heredado.
- Al registrar produccion, medico_id y medico_origen_id corresponden al origen del contrato, no a heuristicas contextuales.
- No aparece "No detectado" cuando la plantilla esta correctamente configurada.

## 10) Decision Recomendada

Adoptar trazabilidad inmutable basada en plantilla como politica del dominio de contratos.

Con esta decision:
- El origen medico deja de ser inferido y pasa a ser heredado.
- Se alinea el sistema con la verdad comercial de la venta.
- Se simplifica auditoria clinica y financiera de punta a punta.

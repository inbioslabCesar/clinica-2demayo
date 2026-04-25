# Especificacion Funcional-Tecnica
## Contratos Inteligentes para Integracion de Ayuda al Diagnostico

Fecha: 2026-04-19
Estado: Listo para implementacion
Alcance: Backend PHP + MySQL, ajustes minimos en frontend de recepcion/HC para trazabilidad

---

## 1. Objetivo

Lograr que un evento de agenda de contrato funcione como disparador clinico equivalente al flujo de paquetes/perfiles:

- Al marcar un evento como atendido o espontaneo, el sistema debe crear (o vincular) la consulta clinica.
- Debe inyectar servicios del evento y sub-servicios diagnosticos definidos por plantilla.
- Debe generar ordenes de laboratorio e imagen cuando corresponda.
- Debe dejar trazabilidad total para Historia Clinica, facturacion y auditoria.
- Debe ser idempotente (sin duplicados) ante reintentos o cambios de estado repetidos.

---

## 2. Problema actual (gap)

Actualmente el flujo de contratos:

- Cambia estado del evento de agenda.
- Consume cupo/cobertura contractual.
- Registra consumo financiero.

Pero no ejecuta la inyeccion clinica completa (consulta + cotizacion tecnica + ordenes), por lo que la Historia Clinica no recibe automaticamente el paquete diagnostico esperado para ese evento.

---

## 3. Alcance funcional

Incluye:

- Modelo de plantilla con sub-servicios por evento.
- Motor de ejecucion automatica al atender evento de agenda.
- Persistencia de vinculaciones tecnicas (consulta/cotizacion/ordenes).
- Reglas para reprogramado, espontaneo, cancelado y reversas.
- Contratos de API y matriz de QA.

No incluye (fase posterior):

- Motor de reglas complejas por edad/sexo/diagnostico.
- Repriorizacion automatica por resultados de laboratorio.
- Mensajeria externa al paciente.

---

## 4. Modelo de datos propuesto

### 4.1 Tabla nueva: contratos_plantillas_evento_subservicios

Finalidad: definir N sub-servicios ligados a un item principal de la plantilla.

Campos minimos:

- id BIGINT UNSIGNED PK AI
- plantilla_item_id BIGINT UNSIGNED NOT NULL
- servicio_tipo ENUM('consulta','ecografia','rayosx','procedimiento','operacion','laboratorio','farmacia') NOT NULL
- servicio_id BIGINT UNSIGNED NOT NULL
- descripcion_snapshot VARCHAR(255) NULL
- cantidad DECIMAL(10,2) NOT NULL DEFAULT 1.00
- orden_inyeccion INT NOT NULL DEFAULT 1
- origen_cobro_default ENUM('contrato','extra') NOT NULL DEFAULT 'contrato'
- requiere_orden TINYINT(1) NOT NULL DEFAULT 1
- laboratorio_referencia TINYINT(1) NOT NULL DEFAULT 0
- tipo_derivacion ENUM('monto_fijo','porcentaje') NULL
- valor_derivacion DECIMAL(10,2) NULL
- estado ENUM('activo','inactivo') NOT NULL DEFAULT 'activo'
- created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
- updated_at DATETIME NULL ON UPDATE CURRENT_TIMESTAMP

Indices:

- idx_cp_evento_sub_item (plantilla_item_id)
- idx_cp_evento_sub_servicio (servicio_tipo, servicio_id)

FK:

- plantilla_item_id -> contratos_plantillas_items(id)

### 4.2 Alter en agenda_contrato

Agregar campos para idempotencia y trazabilidad de ejecucion:

- consulta_id BIGINT UNSIGNED NULL
- cotizacion_id_ejecucion BIGINT UNSIGNED NULL
- ejecucion_token VARCHAR(64) NULL
- ejecucion_estado ENUM('pendiente','ejecutado','revertido','error') NOT NULL DEFAULT 'pendiente'
- ejecucion_error TEXT NULL
- ejecutado_en DATETIME NULL
- ejecutado_por BIGINT UNSIGNED NULL

Indices:

- idx_agenda_consulta (consulta_id)
- idx_agenda_cotizacion_ejecucion (cotizacion_id_ejecucion)
- uq_agenda_ejecucion_token (ejecucion_token) UNIQUE

### 4.3 Tabla nueva opcional (recomendada): agenda_contrato_subservicios_snapshot

Finalidad: congelar composicion de sub-servicios por evento para evitar drift cuando cambie la plantilla.

Campos:

- id BIGINT UNSIGNED PK AI
- agenda_evento_id BIGINT UNSIGNED NOT NULL
- plantilla_subservicio_id BIGINT UNSIGNED NULL
- servicio_tipo ENUM(...) NOT NULL
- servicio_id BIGINT UNSIGNED NOT NULL
- descripcion_snapshot VARCHAR(255) NULL
- cantidad DECIMAL(10,2) NOT NULL
- orden_inyeccion INT NOT NULL
- origen_cobro_default ENUM('contrato','extra') NOT NULL
- requiere_orden TINYINT(1) NOT NULL DEFAULT 1
- laboratorio_referencia TINYINT(1) NOT NULL DEFAULT 0
- tipo_derivacion ENUM('monto_fijo','porcentaje') NULL
- valor_derivacion DECIMAL(10,2) NULL
- created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP

Indices:

- idx_agenda_snap_evento (agenda_evento_id)

---

## 5. Reglas de negocio

### 5.1 Disparo de ejecucion

Se ejecuta SOLO cuando estado_evento cambia a:

- atendido
- espontaneo

Y SOLO si el evento no esta marcado previamente como ejecutado (idempotencia).

### 5.2 Regla de cobertura

Para cada servicio a inyectar:

- Si hay cobertura vigente y cupo disponible: origen_cobro = contrato, monto = 0.
- Si no hay cobertura y permitir_extra = 1: origen_cobro = extra, monto = tarifa regular.
- Si no hay cobertura y permitir_extra = 0: rechazar transaccion completa.

### 5.3 Reprogramado

- Reprogramar evento no ejecutado: solo cambia fecha/estado.
- Reprogramar evento ejecutado: no duplica consulta, no duplica ordenes.
- Si se crea nuevo evento por reprogramacion, el anterior queda reprogramado/cancelado con enlace de referencia.

### 5.4 Espontaneo

- Puede ejecutar fuera de fecha programada.
- Debe vincularse al evento original cuando exista.
- Si no existe evento compatible, puede crearse evento tecnico con tipo espontaneo y trazabilidad.

### 5.5 Reversa

- Si evento ejecutado pasa a cancelado/revertido:
  - No eliminar evidencia clinica ya usada (resultados, informes, firmas).
  - Solo anular cotizacion tecnica y consumos si no existe evidencia clinica consumida.
  - Dejar auditoria de reversa y motivo.

---

## 6. Flujo transaccional (backend)

Operacion principal: actualizar_evento_agenda (extendida)

Pasos dentro de una sola transaccion DB:

1. Bloquear evento agenda por id (SELECT ... FOR UPDATE).
2. Validar transicion de estado permitida.
3. Si destino no es atendido/espontaneo: actualizar estado y salir.
4. Calcular/leer ejecucion_token deterministico del evento.
5. Si token ya ejecutado: retornar exito idempotente con ids existentes.
6. Resolver o crear consulta para paciente + medico + fecha operativa.
7. Cargar item principal y sub-servicios (snapshot o plantilla).
8. Construir cotizacion tecnica interna (estado pagado tecnico o estado configurado) con:
   - detalle principal
   - detalles sub-servicios
   - metadata contrato en detalle
9. Ejecutar creacion/sincronizacion de ordenes laboratorio e imagen.
10. Registrar consumos contractuales por cada detalle aplicable.
11. Marcar evento como ejecutado con ids y timestamp.
12. Confirmar transaccion.

Si cualquier paso falla:

- rollback total
- marcar ejecucion_estado = error y guardar ejecucion_error
- devolver mensaje controlado

---

## 7. Contratos de API (payloads)

### 7.1 POST api_contratos.php accion=actualizar_evento_agenda (v2)

Request JSON:

{
  "accion": "actualizar_evento_agenda",
  "id": 12345,
  "estado_evento": "atendido",
  "permitir_extra": 0,
  "forzar_reinyeccion": 0,
  "contexto": {
    "origen": "estado_cuenta_contrato",
    "usuario_id": 77
  }
}

Response exito:

{
  "success": true,
  "modo": "ejecucion" ,
  "idempotente": false,
  "evento": {
    "id": 12345,
    "estado_evento": "atendido",
    "ejecucion_estado": "ejecutado"
  },
  "vinculos": {
    "consulta_id": 9981,
    "cotizacion_id": 23014,
    "ordenes_laboratorio": [445, 446],
    "ordenes_imagen": [771]
  },
  "resumen": {
    "items_inyectados": 4,
    "items_contrato": 3,
    "items_extra": 1
  }
}

Response idempotente (reintento):

{
  "success": true,
  "modo": "idempotente",
  "idempotente": true,
  "evento": {
    "id": 12345,
    "estado_evento": "atendido",
    "ejecucion_estado": "ejecutado"
  },
  "vinculos": {
    "consulta_id": 9981,
    "cotizacion_id": 23014,
    "ordenes_laboratorio": [445, 446],
    "ordenes_imagen": [771]
  }
}

Response error cobertura:

{
  "success": false,
  "error_code": "SIN_COBERTURA",
  "error": "No existe cobertura contractual para uno o mas servicios",
  "detalles": {
    "faltantes": [
      { "servicio_tipo": "laboratorio", "servicio_id": 12 }
    ]
  }
}

### 7.2 GET api_contratos.php accion=detalle_ejecucion_evento

Query params:

- agenda_evento_id

Response:

{
  "success": true,
  "evento": {
    "id": 12345,
    "estado_evento": "atendido",
    "ejecucion_estado": "ejecutado",
    "ejecutado_en": "2026-04-19 11:32:05"
  },
  "vinculos": {
    "consulta_id": 9981,
    "cotizacion_id": 23014
  },
  "detalles": [
    {
      "servicio_tipo": "consulta",
      "servicio_id": 6,
      "origen_cobro": "contrato",
      "subtotal": 0.00
    }
  ]
}

---

## 8. Requisitos de idempotencia

Clave de idempotencia recomendada:

- ejecucion_token = SHA2(CONCAT('agenda:', evento_id, ':estado:', estado_objetivo), 256)

Reglas:

- Token unico por evento y tipo de ejecucion final.
- Reintentos con mismo token deben retornar misma salida funcional.
- No crear segunda consulta ni segunda cotizacion tecnica para el mismo evento ejecutado.

Controles tecnicos:

- UNIQUE en ejecucion_token.
- SELECT FOR UPDATE sobre agenda_contrato.id.
- Verificacion de ya-ejecutado antes de inyectar.

---

## 9. Integracion con Historia Clinica

Objetivo HC:

- Mantener consumo por consulta_id ya existente.
- Mostrar badge de origen para cada orden/detalle cuando provenga de contrato.

Ajustes minimos:

- Exponer en endpoints de ordenes (o resumen HC) bandera origen_contrato.
- En UI de apoyo diagnostico mostrar etiqueta: "Precargado por contrato".

No se altera el flujo medico principal ni permisos existentes.

---

## 10. Observabilidad y auditoria

Registrar en log/auditoria:

- evento_id
- contrato_paciente_id
- paciente_id
- consulta_id
- cotizacion_id
- token_ejecucion
- usuario_ejecutor
- tiempo_total_ms
- resultado (ok/idempotente/error)
- error_tecnico resumido

Metricas sugeridas:

- tasa_ejecucion_ok
- tasa_idempotencia_hit
- tasa_error_por_cobertura
- tiempo_promedio_ejecucion

---

## 11. Plan de implementacion por fases

Fase 1 - Schema y migraciones:

- Crear tablas/columnas nuevas.
- Crear indices y llaves.
- Backfill nulo seguro para campos de agenda.

Fase 2 - Motor backend:

- Extender accion actualizar_evento_agenda con pipeline transaccional.
- Reusar funciones existentes de cotizacion/ordenes cuando sea posible.

Fase 3 - Endpoint de consulta de ejecucion:

- Implementar detalle_ejecucion_evento para soporte operativo y QA.

Fase 4 - UI minima:

- EstadoCuentaContrato: mostrar resultado de ejecucion y acceso a consulta.
- HC: badge de origen contrato.

Fase 5 - Hardening:

- Auditoria, metrica y pruebas de concurrencia.

---

## 12. Casos de prueba QA (criterios de aceptacion)

QA-01 Atencion con cobertura total

- Dado evento pendiente con sub-servicios cubiertos
- Cuando se marca atendido
- Entonces se crea/vincula consulta, cotizacion tecnica y ordenes
- Y todos los subtotales cubiertos quedan en 0 con origen contrato

QA-02 Atencion sin cobertura y permitir_extra=0

- Dado evento con al menos un sub-servicio sin cupo
- Cuando se marca atendido
- Entonces la operacion falla completa
- Y no queda consulta/cotizacion parcial creada

QA-03 Atencion sin cobertura y permitir_extra=1

- Dado evento con faltante de cobertura
- Cuando se marca atendido con permitir_extra
- Entonces se ejecuta inyeccion mixta
- Y los items sin cobertura se registran como origen extra

QA-04 Reintento idempotente

- Dado evento ya ejecutado
- Cuando se reenvia la misma accion
- Entonces no se crean duplicados
- Y la respuesta marca idempotente=true

QA-05 Reprogramado antes de ejecucion

- Dado evento pendiente
- Cuando se reprograma
- Entonces solo cambia agenda, sin crear consulta/ordenes

QA-06 Reprogramado despues de ejecucion

- Dado evento ejecutado
- Cuando se reprograma
- Entonces no se duplica inyeccion ni ordenes

QA-07 Espontaneo

- Dado paciente llega fuera de fecha
- Cuando se marca espontaneo
- Entonces se ejecuta pipeline clinico igual que atendido
- Y queda traza de estado espontaneo

QA-08 Concurrencia

- Dado dos usuarios marcan atendido casi al mismo tiempo
- Cuando ambos requests llegan
- Entonces solo uno ejecuta inyeccion real
- Y el otro retorna idempotente

QA-09 Reversa sin evidencia clinica

- Dado evento ejecutado sin resultados ni informes consumidos
- Cuando se revierte
- Entonces se permite anular cotizacion tecnica y consumo

QA-10 Reversa con evidencia clinica

- Dado evento ejecutado con resultados ya cargados
- Cuando se revierte
- Entonces se bloquea reversa destructiva
- Y se solicita proceso administrativo controlado

---

## 13. Definiciones operativas

- Cotizacion tecnica: cotizacion interna de ejecucion clinica, no necesariamente visible para venta tradicional.
- Evento ejecutado: evento con pipeline clinico completo persistido y trazado.
- Extra: consumo fuera de cobertura contractual, facturable segun tarifa vigente.

---

## 14. Riesgos y mitigacion

Riesgo: duplicidad por concurrencia.
Mitigacion: token unico + lock transaccional + respuesta idempotente.

Riesgo: drift de plantilla luego de contratos activos.
Mitigacion: snapshot por evento al generar agenda.

Riesgo: reversas inconsistente con evidencia clinica.
Mitigacion: politicas de bloqueo por estado de resultados/documentos.

Riesgo: acoplamiento alto con modulos de cotizacion existentes.
Mitigacion: encapsular adaptador de inyeccion para agenda y reusar funciones estables.

---

## 15. Entregables de desarrollo esperados

- Migracion SQL versionada para schema nuevo.
- Cambios en api_contratos.php (accion actualizar_evento_agenda + detalle_ejecucion_evento).
- Servicio interno reutilizable para inyeccion clinica desde agenda.
- Ajustes de UI de estado de cuenta y HC para trazabilidad.
- Suite minima de pruebas de regresion e idempotencia.

Fin del documento.

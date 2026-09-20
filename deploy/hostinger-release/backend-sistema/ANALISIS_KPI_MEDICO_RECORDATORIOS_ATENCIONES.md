# Especificación funcional corta de KPI

Fecha: 2026-08-23
Alcance: alinear lo que ven Médico, Recepción (Recordatorios) y Caja/Administración (Atenciones).
Estado: diagnóstico funcional, sin cambios de código.

## 1) Objetivo
Definir indicadores no ambiguos para evitar comparar pantallas con universos distintos.

## 2) KPI oficiales por módulo

| Módulo | KPI visible | Definición funcional | Fórmula operativa | Fuente de datos principal | Responsable de uso |
|---|---|---|---|---|---|
| Panel Médico | Cola clínica de hoy | Trabajo pendiente real del médico para hoy | Consultas abiertas de hoy + Agenda clínica abierta de hoy (sin estados cerrados) | consultas + agenda_servicios_cotizacion | Médico |
| Panel Médico | Producción clínica de hoy | Actos ya atendidos hoy | Consultas en estado completada/completado de hoy | consultas | Médico / Jefatura médica |
| Panel Médico | Total histórico filtrado | Universo del listado según filtros activos | COUNT del listado actual (puede incluir completadas/canceladas si no se excluyen) | consultas (stats del endpoint) | Médico (contexto), no para carga inmediata |
| Recordatorios | Ocupación operativa del día | Citas/eventos programados que aún demandan gestión | Consultas abiertas del día + Agenda abierta del día (con filtros de estado de recordatorio) | consultas + agenda_servicios_cotizacion + recordatorios_* | Recepción |
| Atenciones | Atenciones financieras del día | Operación de cobro/cotización multiservicio | COUNT de cotizaciones/atenciones del día (incluye consulta y no consulta) | cotizaciones + cotizaciones_detalle | Caja / Administración |

## 3) Reglas de oro de lectura
1. Nunca comparar Total histórico filtrado del médico con Atenciones del día.
2. Para carga asistencial usar solo Cola clínica de hoy.
3. Atenciones mide transacción económica, no equivalencia 1 a 1 con consultas médicas.
4. Recordatorios es un tablero de gestión operativa de recepción, no de productividad clínica pura.

## 4) Definición de estados recomendada

### Consultas abiertas
Estados NO cerrados: diferente de cancelada, anulada, completada/completado.

### Agenda abierta
Estados NO cerrados: diferente de cancelado, no_asistio, anulada, completado.

### Producción clínica
Estados cerrados clínicos: completada/completado.

## 5) SQL de verificación rápida (auditoría)

### 5.1 Resumen general por médico
```sql
SET @med := 16;

SELECT
  COUNT(*) AS total_consultas_todas,
  SUM(LOWER(TRIM(COALESCE(estado,'')))='pendiente') AS pendientes,
  SUM(LOWER(TRIM(COALESCE(estado,''))) IN ('completada','completado')) AS completadas,
  SUM(LOWER(TRIM(COALESCE(estado,''))) IN ('cancelada','cancelado')) AS canceladas
FROM consultas
WHERE medico_id=@med;
```

### 5.2 Cola clínica de hoy (componente consultas)
```sql
SET @med := 16;
SET @f := CURDATE();

SELECT COUNT(*) AS consultas_abiertas_hoy
FROM consultas c
WHERE c.medico_id=@med
  AND c.fecha=@f
  AND LOWER(TRIM(COALESCE(c.estado,''))) NOT IN ('cancelada','anulada','completada');
```

### 5.3 Cola clínica de hoy (componente agenda)
```sql
SET @med := 16;
SET @f := CURDATE();

SELECT COUNT(*) AS agenda_abierta_hoy
FROM agenda_servicios_cotizacion a
LEFT JOIN cotizaciones_detalle cd ON cd.id=a.cotizacion_detalle_id
LEFT JOIN tarifas t ON t.id=COALESCE(cd.servicio_id,a.servicio_id)
WHERE COALESCE(a.medico_id,cd.medico_id,t.medico_id,0)=@med
  AND a.fecha_programada=@f
  AND LOWER(TRIM(COALESCE(a.estado_evento,''))) NOT IN ('cancelado','no_asistio','anulada','completado')
  AND LOWER(TRIM(COALESCE(a.servicio_tipo,''))) IN ('consulta','rayosx','rayos x','rayos_x','rx','ecografia','procedimiento','procedimientos','operacion','operaciones','cirugia','cirugias');
```

### 5.4 Producción clínica de hoy
```sql
SET @med := 16;

SELECT
  COUNT(*) AS total_dia,
  SUM(LOWER(TRIM(COALESCE(estado,'')))='pendiente') AS pendientes_dia,
  SUM(LOWER(TRIM(COALESCE(estado,''))) IN ('completada','completado')) AS completadas_dia
FROM consultas
WHERE medico_id=@med
  AND DATE(fecha)=CURDATE();
```

### 5.5 Atenciones financieras del día (no equivalente a consultas)
```sql
SET @med := 16;

SELECT LOWER(TRIM(COALESCE(cd.servicio_tipo,''))) AS servicio_tipo,
       COUNT(DISTINCT c.id) AS cotizaciones_hoy
FROM cotizaciones c
INNER JOIN cotizaciones_detalle cd ON cd.cotizacion_id=c.id
WHERE DATE(c.fecha)=CURDATE()
  AND (cd.medico_id=@med OR cd.consulta_id IN (SELECT id FROM consultas WHERE medico_id=@med))
GROUP BY LOWER(TRIM(COALESCE(cd.servicio_tipo,'')))
ORDER BY cotizaciones_hoy DESC;
```

## 6) Diccionario semántico para UI (texto sugerido)
1. Panel Médico:
   - KPI principal: Pendientes de hoy (cola clínica).
   - KPI secundario: Atendidas hoy.
   - KPI contextual: Total histórico filtrado.
2. Recordatorios:
   - Ocupación operativa de hoy.
3. Atenciones:
   - Atenciones/cotizaciones del día por servicio.

## 7) Criterio de aceptación funcional
Se considera alineado cuando:
1. Todo actor entiende que cada pantalla mide un universo distinto.
2. El número de Cola clínica de hoy es trazable a consultas abiertas + agenda abierta del día.
3. Nadie usa Atenciones como sinónimo de consultas médicas.
4. Las etiquetas UI distinguen claramente histórico, operativo y financiero.

## 8) Resultado de diagnóstico sobre caso observado
Con datos del médico evaluado:
1. Total consultas todas: 15.
2. Pendientes: 2.
3. Completadas: 12.
4. Agenda clínica abierta hoy: 2.
5. Atenciones/cotizaciones hoy: 24 (incluye farmacia, laboratorio y otros).

Conclusión: no hay incoherencia de base de datos; la brecha proviene de definición y etiqueta de indicadores entre módulos.

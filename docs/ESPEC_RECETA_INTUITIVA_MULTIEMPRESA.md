# Especificacion Funcional-Tecnica
## Receta Medica Intuitiva y Automatizada (Multiempresa, Multiespecialidad)

Fecha: 2026-07-12
Estado: Propuesta lista para implementacion por fases
Ambito: Historia Clinica (HC), Receta Medica, Cotizacion Farmacia, Evolucion de Tratamiento (Enfermeria)

---

## 1. Objetivo

Reducir drásticamente el tiempo de llenado de receta medica y los clics del medico, mediante:

1. Sugerencias inteligentes por contexto (empresa, especialidad, medico, diagnostico).
2. Seleccion multiple por check de tratamientos frecuentes.
3. Separacion explicita entre:
- Prescripcion clinica (frecuencia de aplicacion/administracion).
- Dispensacion comercial (cantidad a cobrar/despachar).

Sin romper:

1. HC historicas ya guardadas.
2. Flujo actual de sincronizacion a enfermeria.
3. Flujo actual de sincronizacion a cotizacion/farmacia.

---

## 2. Problemas detectados en el flujo actual

1. UX por item: el medico completa muchos campos por medicamento.
2. No hay sugerencias ni ranking real por uso frecuente.
3. El calculo de cantidad puede mezclar logica clinica con logica comercial.
4. Casos topicos (cremas, geles, pomadas) pueden terminar sobredimensionados al cobrar si se interpreta aplicacion como unidad de venta.
5. No existe motor multiempresa para favoritos y protocolos por tenant.

---

## 3. Principios de diseno

1. Multiempresa estricto: ninguna sugerencia cruza datos entre empresas.
2. Multiespecialidad: pediatria, cardiologia, ginecologia, etc, con capas de sugerencia por contexto.
3. Rapido primero, avanzado disponible: modo rapido por defecto y modo detallado opcional.
4. Compatibilidad hacia atras: el payload legado de receta sigue siendo valido.
5. No bloqueo del acto medico por inventario: validar stock duro en farmacia/cobro, no al prescribir.

---

## 4. Modelo de experiencia (UX)

## 4.1 Modo rapido (nuevo default)

Bloques en orden:

1. Tratamientos frecuentes sugeridos:
- Chips/cards con checkbox.
- Permite seleccionar varios a la vez.
- Cada sugerido trae dosis/frecuencia/duracion preconfiguradas.

2. Medicamentos frecuentes por contexto:
- Tabs: "Empresa", "Especialidad", "Mi practica", "Casos similares".
- Click agrega item con defaults.

3. Ajustes rapidos por item:
- Indicacion (texto corto).
- Cantidad de dispensacion (cuando aplique).
- Observacion opcional.

4. Vista de resumen:
- Prescripcion clinica (frecuencia/duracion).
- Dispensacion comercial (unidad y cantidad cobro).
- Alertas de inconsistencia.

## 4.2 Modo avanzado (mantener)

1. Formulario detallado actual por item.
2. Se activa por boton "Editar detalle".
3. Casos complejos siguen totalmente soportados.

---

## 5. Contexto de sugerencias (motor inteligente)

Ranking por puntaje compuesto:

Score = W1*empresa + W2*especialidad + W3*medico + W4*diagnostico + W5*recencia

Donde:

1. empresa: frecuencia en la empresa actual (tenant actual).
2. especialidad: frecuencia en especialidad activa de la consulta.
3. medico: historico del medico en curso.
4. diagnostico: co-ocurrencia con CIE10 principal/secundarios.
5. recencia: mayor peso a ultimos 90-180 dias.

Reglas de aislamiento:

1. Todas las consultas SQL de sugerencias deben filtrar por tenant_id.
2. Si no hay suficientes datos de medico, fallback a especialidad.
3. Si no hay suficientes datos de especialidad, fallback a empresa.
4. Nunca fallback global entre empresas.

---

## 6. Separacion clinica vs comercial (punto critico)

Agregar semantica explicita por item:

1. Campos clinicos:
- dosis_texto
- frecuencia_tipo
- frecuencia_valor / frecuencia_horas
- duracion_valor
- duracion_unidad
- via_admin (opcional)
- indicacion_clinica (opcional)

2. Campos comerciales:
- unidad_dispensacion (tubo, frasco, caja, ampolla, tableta, etc)
- cantidad_dispensacion (entero decimal segun regla)
- calculo_comercial_modo: auto | manual
- justificacion_manual (opcional cuando manual)

Regla principal:

1. Enfermeria usa principalmente los campos clinicos.
2. Cotizacion/farmacia usa campos comerciales.
3. Si campos comerciales no existen (receta legacy), usar fallback legado actual.

---

## 7. Regla especial para topicos (cremas y similares)

Problema que resolvemos:

1. "5 veces al dia por 1 mes" no implica 150 tubos.

Nueva regla:

1. Frecuencia de aplicacion solo define plan clinico/enfermeria.
2. Cantidad de dispensacion topica:
- sugerida por protocolo/categoria farmacologica.
- editable por medico (o por farmacia segun politica).

Politica de seguridad:

1. Si forma farmaceutica es topica y no hay cantidad_dispensacion definida:
- sugerir 1 unidad.
- marcar "revisar en farmacia".
- no extrapolar automaticamente por numero de aplicaciones.

---

## 8. Protocolos y plantillas de receta

Entidad conceptual: protocolo_receta

Campos minimos:

1. tenant_id
2. nombre_protocolo
3. especialidad_id (nullable)
4. medico_id (nullable)
5. activo
6. prioridad
7. items_json (lista de medicamentos con defaults clinicos y comerciales)
8. version
9. created_by / updated_by / timestamps

Jerarquia de aplicacion:

1. Medico + especialidad.
2. Especialidad empresa.
3. General empresa.

Comportamiento:

1. Medico puede aplicar protocolo completo con 1 click.
2. Puede desmarcar items individuales.
3. Puede editar 1 o varios items antes de guardar.

---

## 9. Compatibilidad y no regresion

## 9.1 HC historicas

1. Mantener formato actual de receta como contrato base.
2. Nuevos campos son opcionales.
3. Lectura vieja y nueva conviven.

## 9.2 Evolucion de enfermeria

1. Mantener poblacion de receta_snapshot.
2. Mantener logica de versionado y estado actual.
3. plan multidia continua consumiendo frecuencia/duracion clinica.
4. ignorar campos comerciales cuando no son necesarios.

## 9.3 Cotizacion/farmacia

Prioridad de cantidad:

1. cantidad_dispensacion (nuevo) cuando exista y sea valida.
2. fallback a calculo legado actual cuando no exista.

Con esto, recetas antiguas no se rompen y recetas nuevas evitan sobrecobro en topicos.

---

## 10. Arquitectura funcional por capas

## Capa A: Captura UX

1. modo rapido (sugeridos, checks, resumen).
2. modo avanzado (editor detallado).

## Capa B: Normalizacion de receta

1. convertir entrada UX a esquema canonico.
2. validar clinico/comercial.
3. generar advertencias no bloqueantes.

## Capa C: Persistencia HC

1. guardar receta canonica + compat payload.
2. guardar metadatos de version de protocolo usado.

## Capa D: Sync secundarios

1. sync enfermeria (clinico).
2. sync cotizacion (comercial).

## Capa E: Analytics de sugerencias

1. registrar uso real por item/protocolo.
2. retroalimentar ranking.

---

## 11. Feature flags (despliegue seguro)

Nivel tenant (empresa):

1. receta_v2_ui_rapida
2. receta_v2_sugerencias
3. receta_v2_protocolos
4. receta_v2_comercial_separado
5. receta_v2_topicos_regla_segura

Estrategia:

1. Activar por empresa piloto.
2. Monitorear metricas.
3. Expandir gradualmente.

---

## 12. Migracion de datos

No destructiva:

1. No alterar recetas historicas guardadas.
2. No recalcular montos historicos.
3. Nuevos campos solo para nuevas recetas o ediciones nuevas.

Backfill opcional (fase posterior):

1. inferir unidad_dispensacion por presentacion catalogo.
2. marcar confianza de inferencia.
3. nunca auto-cobrar diferente sin validacion humana.

---

## 13. APIs propuestas (contrato conceptual)

1. GET /api_receta_sugerencias.php
- params: tenant_id, especialidad_id, medico_id, cie10[]
- output: top medicamentos + top protocolos + score explain

2. GET /api_receta_protocolos.php
- params: tenant_id, especialidad_id, medico_id
- output: protocolos aplicables por jerarquia

3. POST /api_receta_protocolos.php
- CRUD protocolos (admin/coordinador)

4. POST /api_historia_clinica.php
- mantiene endpoint actual
- acepta campos nuevos opcionales en receta

5. Sync interno actual permanece
- enfermeria: usa clinico
- cotizacion: prioriza comercial cuando exista

---

## 14. Criterios de aceptacion por rol

## 14.1 Medico

1. Puede crear receta comun en menos pasos (seleccion multiple).
2. Puede aplicar protocolo y editar solo excepciones.
3. Puede seguir usando modo avanzado si desea.

## 14.2 Enfermeria

1. Ve plan clinico consistente y versionado.
2. No se rompe el avance actual ni historico.

## 14.3 Farmacia/Caja

1. Cantidad cobrada responde a cantidad_dispensacion cuando exista.
2. Topicos no se sobreescalan por frecuencia de aplicacion.
3. Legacy continua operando sin bloqueo.

## 14.4 Administracion Multiempresa

1. Sugerencias no cruzan datos entre empresas.
2. Cada empresa administra sus protocolos.
3. Se puede activar/desactivar por tenant con flags.

---

## 15. Plan de implementacion por fases

## Fase 0: Preparacion (1 sprint)

1. Definir esquema canonico de receta v2 compatible.
2. Definir categorias farmaceuticas (incluye topicos).
3. Definir feature flags por tenant.

## Fase 1: UX rapida + sugeridos basicos (1-2 sprints)

1. Panel sugeridos empresa/especialidad/medico.
2. Seleccion multiple con checks.
3. Guardado compatible con payload actual.

## Fase 2: Protocolos (1 sprint)

1. CRUD protocolos por tenant.
2. Aplicar protocolo con 1 click.
3. Trazabilidad de uso por protocolo.

## Fase 3: Separacion comercial (1 sprint)

1. Campos comerciales opcionales.
2. Priorizacion de cantidad_dispensacion en sync cotizacion.
3. Regla segura topicos.

## Fase 4: Optimización inteligente (1 sprint)

1. Ranking con CIE10 y recencia.
2. Ajuste de pesos por adopcion real.
3. tablero de metricas de productividad.

---

## 16. Matriz de riesgos y mitigacion

1. Riesgo: regresion en HC viejas.
- Mitigacion: contrato backward compatible + pruebas de lectura legacy.

2. Riesgo: inconsistencias enfermeria.
- Mitigacion: no cambiar semantica de campos clinicos existentes.

3. Riesgo: impacto en cobros.
- Mitigacion: fallback legado + flag por tenant + validacion dual temporal.

4. Riesgo: baja adopcion medica.
- Mitigacion: modo rapido por defecto y avanzado siempre disponible.

---

## 17. Pruebas UAT minimas

1. Multiempresa:
- Empresa A no ve sugerencias de Empresa B.

2. Multiespecialidad:
- Pediatria y cardiologia ven sugeridos distintos en la misma empresa.

3. Topicos:
- Frecuencia alta no multiplica automaticamente unidades de cobro.

4. Compatibilidad:
- HC antigua imprime/lee igual.
- Evolucion enfermeria sigue mostrando estado y progreso.

5. Cotizacion:
- Nueva receta con campos comerciales usa cantidad_dispensacion.
- Receta legacy usa fallback actual.

---

## 18. KPIs de exito

1. Tiempo promedio de llenado de receta.
2. Clics promedio por receta.
3. Porcentaje de recetas con protocolo aplicado.
4. Tasa de correcciones manuales en farmacia por sobrecantidad.
5. Satisfaccion medica por tenant/especialidad.

---

## 19. Decision recomendada

Aprobar implementacion incremental con feature flags por tenant.

Orden recomendado:

1. UX rapida + sugerencias.
2. Protocolos multiempresa.
3. Separacion clinico/comercial con regla topicos.

Este orden entrega valor rapido al medico, minimiza riesgo operativo y protege compatibilidad con HC y enfermeria.

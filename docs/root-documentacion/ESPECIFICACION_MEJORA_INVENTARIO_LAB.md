# Especificacion funcional: mejora intuitiva de inventario de laboratorio

## 1. Objetivo
Diseñar una mejora funcional para el flujo de reactivos de laboratorio que sea intuitiva para operacion diaria (hospital y clinica), manteniendo la arquitectura actual:
- Almacen general (admin)
- Inventario interno de laboratorio (panel laboratorio)

No se cambia el concepto de doble almacen. Se mejora la experiencia, trazabilidad y reportes.

## 2. Alcance
Incluye:
- Flujo operativo de ingreso, transferencia y consumo por prueba.
- Reglas de conversion de presentacion comercial a unidad base.
- Visualizacion de transferencias en panel laboratorio.
- Indicadores de rendimiento para farmacia/jefatura.
- Reportes exportables (PDF/Excel).
- Roles y permisos sugeridos.

No incluye:
- Cambio de arquitectura de base de datos fuera del modelo actual.
- Reemplazo del flujo actual de cobro/resultado; solo se integra mejor.

## 3. Modelo conceptual de inventario
### 3.1 Unidad base y presentacion
Cada reactivo debe tener:
- Presentacion comercial: ejemplo Caja x 2 frascos x 50 ml.
- Unidad base: ml, pruebas, tiras, etc.
- Factor de presentacion: conversion a unidad base.

Formula:
- stock_base = cantidad_presentacion x factor_presentacion

Ejemplo A (glucosa):
- 1 caja x (2 x 50 ml) = 100 ml
- factor_presentacion = 100 ml por caja

Ejemplo B (VIH):
- 1 caja = 25 pruebas
- factor_presentacion = 25 pruebas por caja

### 3.2 Receta por examen
La receta siempre se guarda en unidad base por prueba.
- glucosa: 0.5 ml por prueba
- VIH: 1 prueba por prueba

Formula de capacidad:
- pruebas_posibles = stock_interno_base / consumo_por_prueba

## 4. Flujo operativo unificado
## 4.1 Flujo hospital
1. Laboratorio detecta faltante de reactivo.
2. Se genera requerimiento interno a farmacia/almacen general.
3. Farmacia registra compra y recepciona en almacen general.
4. Farmacia transfiere al inventario interno de laboratorio.
5. Laboratorio configura receta por examen (si no existe).
6. Por cada resultado validado, se descuenta consumo automatico.
7. Farmacia audita rendimiento (consumo real vs esperado).

## 4.2 Flujo clinica pequena
1. Jefatura compra reactivo (con o sin paso intermedio por farmacia).
2. Se registra ingreso en almacen general.
3. Se transfiere al inventario interno de laboratorio.
4. Laboratorio consume automatico por receta.
5. Reportes de control se mantienen igual.

## 5. Reglas funcionales obligatorias
1. Toda compra ingresa primero a almacen general (trazabilidad).
2. Toda entrega a laboratorio debe registrarse como transferencia interna.
3. Toda receta se expresa en unidad base por prueba.
4. Todo resultado validado dispara consumo automatico.
5. El saldo interno se calcula como:
- saldo_interno = transferido_a_laboratorio - consumido_aplicado

## 6. Mejora UX en panel de laboratorio
## 6.1 Transferir a laboratorio
Formulario debe permitir:
- Item reactivo
- Modo de ingreso:
  - Por presentacion (cajas, frascos, kits)
  - Por unidad base (ml/pruebas)
- Conversion visible en tiempo real

Ejemplo visual:
- 2 cajas x 100 ml = 200 ml transferidos

## 6.2 Tabla ultimas transferencias (mejora)
Hoy solo muestra Fecha/Items/Cant.
Debe mostrar:
- ID
- Fecha
- Reactivo(s)
- Detalle de entrega (presentacion)
- Equivalente base
- Responsable

Ejemplo fila:
- #125 | 2026-09-11 19:20 | GLUCOSA CROMATEST | 2 cajas x 2x50 ml | 200 ml | FARMACIA 01

## 6.3 Tarjeta de stock interno por reactivo
Por cada reactivo:
- Stock interno actual (unidad base)
- Consumo por prueba (receta)
- Pruebas posibles estimadas
- Umbral de alerta (dias o pruebas restantes)

Formula sugerida:
- pruebas_posibles = floor(stock_interno / consumo_por_prueba)

## 7. Indicadores (KPI) para farmacia y jefatura
Por dia, mes y anio:
1. Pruebas realizadas por examen/reactivo.
2. Pruebas repetidas por examen/reactivo.
3. Consumo esperado:
- consumo_esperado = pruebas_realizadas x consumo_receta
4. Consumo real aplicado.
5. Desviacion:
- desviacion = consumo_real - consumo_esperado
- desviacion_pct = (desviacion / consumo_esperado) x 100
6. Rendimiento del reactivo:
- rendimiento = pruebas_realizadas / pruebas_teoricas

## 8. Reportes exportables
## 8.1 Reporte de consumo por reactivo
Filtros:
- Rango fecha
- Diario / mensual / anual
- Reactivo
- Examen

Columnas minimas:
- Fecha
- Reactivo
- Examen
- Pruebas realizadas
- Pruebas repetidas
- Consumo esperado
- Consumo real
- Desviacion

Exportacion:
- PDF
- Excel

## 8.2 Reporte de transferencias internas
Columnas minimas:
- Fecha
- Origen
- Destino
- Reactivo
- Cantidad presentacion
- Cantidad base
- Usuario responsable

## 9. Roles y permisos sugeridos
1. Administrador
- Acceso total.

2. Farmacia
- Ver y operar almacen general.
- Registrar transferencias a laboratorio.
- Ver reportes de rendimiento y consumo.

3. Laboratorio (jefe/laboratorista autorizado)
- Configurar recetas por examen.
- Ver stock interno.
- Registrar/solicitar transferencias internas segun politica.
- Ver reportes de consumo y repeticion.

4. Jefatura/Gerencia
- Solo lectura de indicadores y reportes.

## 10. Casos de referencia cerrados
## 10.1 Caso glucosa
- Compra: 4 cajas (cada caja = 100 ml) -> 400 ml total en almacen general.
- Transferencia a laboratorio: 2 cajas -> 200 ml internos.
- Entrega a bioquimica: 1 caja equivalente -> 100 ml operativos.
- Receta: 0.5 ml por prueba.
- Capacidad teorica: 100 / 0.5 = 200 pruebas.

## 10.2 Caso VIH
- Compra: 1 caja = 25 pruebas.
- Transferencia a laboratorio: 1 caja -> 25 pruebas internas.
- Receta: 1 prueba por prueba.
- Capacidad teorica: 25 pruebas.

## 11. Plan de implementacion por fases
Fase 1 (UX y trazabilidad minima)
- Mejorar tabla de ultimas transferencias con detalle de reactivo.
- Mostrar conversion presentacion -> base al transferir.
- Mostrar pruebas posibles en stock interno.

Fase 2 (reportes)
- Reporte diario/mensual/anual por reactivo.
- Exportacion PDF/Excel.
- Indicador de pruebas repetidas.

Fase 3 (auditoria y alertas)
- Alertas de cobertura baja por reactivo.
- Desviacion consumo esperado vs real.

## 12. Criterios de aceptacion
1. Usuario laboratorio identifica en 5 segundos que reactivo se transfirio en cada fila.
2. Transferencia muestra siempre cantidad en presentacion y en unidad base.
3. Receta permite inferir pruebas posibles con el saldo actual.
4. Reportes diarios/mensuales/anuales exportan en PDF y Excel.
5. Farmacia puede auditar rendimiento del reactivo sin pedir calculos manuales.

## 13. Decisiones de diseno
1. Mantener dos almacenes (general e interno).
2. Unidad base obligatoria para consumo automatico.
3. Presentacion comercial para operacion humana y compras.
4. Reporteria orientada a rendimiento, no solo a movimientos.

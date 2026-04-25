/*
  TEST SUITE: Mini IA Híbrida (Fase 1 & 2)
  ════════════════════════════════════════════════
  
  Cómo validar que todo funciona correctamente después de implementar
  
  ════════════════════════════════════════════════
// ════════════════════════════════════════════════
// TEST 1: Verificar tablas SQL creadas
// ════════════════════════════════════════════════

Ejecutar en phpMyAdmin SQL:

  -- 1.1 ¿Existen las 3 nuevas tablas?
  SELECT TABLE_NAME, TABLE_ROWS
  FROM information_schema.TABLES
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME IN ('asistente_sinonimos', 'asistente_queries_fallidas', 'asistente_sugerencias_admin');
  
  ESPERADO: 3 filas (una por cada tabla)
  
  -- 1.2 ¿Cuántos sinónimos se cargaron?
  SELECT COUNT(*) as total_sinonimos FROM asistente_sinonimos WHERE activo = 1;
  
  ESPERADO: ~62 registros
  
  -- 1.3 ¿Cuántas categorías de sinónimos?
  SELECT categoria, COUNT(*) as cantidad 
  FROM asistente_sinonimos 
  WHERE activo = 1
  GROUP BY categoria
  ORDER BY cantidad DESC;
  
  ESPERADO: 9 categorías (finanzas, hc, citas, laboratorio, etc.)
  
  -- 1.4 ¿Ejemplo de sinónimos?
  SELECT * FROM asistente_sinonimos WHERE palabra_base = 'agendar' LIMIT 5;
  
  ESPERADO: agendar → [programar, citar, reservar, pedir]

// ════════════════════════════════════════════════
// TEST 2: Verificar PHP detecta sinónimos
// ════════════════════════════════════════════════

Opción A: Test manual en el sistema

  1. Abrir navegador developer console (F12)
  2. Ir a la página donde esté el asistente
  3. Abrir el chat del asistente
  4. Escribir: "¿Cómo programo una consulta?"
  5. ESPERADO:
     - Sistema DEBE encontrar respuesta
     - Porque "programo" → sinónimo "agendar" → respuesta existe
     - Si devuelve respuesta, sinónimos funcionan ✓
  
  6. Alternativamente escribir: "¿Cómo cito a un paciente?"
     - ESPERADO: Encuentra porque "citar" es sinónimo de "agendar"

Opción B: Test directo a API

  POST /api_asistente_chat.php
  
  {
    "action": "buscar",
    "pregunta": "¿Cómo programo una consulta?"
  }
  
  RESPUESTA ESPERADA:
  {
    "success": true,
    "tipo": "respuesta",
    "resultado": {
      "id": X,
      "categoria": "Consultas",
      "pregunta": "¿Cómo agendo una consulta?",
      "respuesta": "..."
    }
  }
  
  Si recibe tipo="respuesta" (no "sin_resultado"), sinónimos funcionan ✓

// ════════════════════════════════════════════════
// TEST 3: Verificar auto-guardado de queries fallidas
// ════════════════════════════════════════════════

Opción A: Test manual

  1. Usar el asistente
  2. Hacer pregunta que NO tenga respuesta:
     "¿Cómo agrego un tratamiento cada 6 horas?"
  3. Sistema devuelve sugerencias genéricas (sin respuesta)
  4. Verificar en SQL:
     
     SELECT * FROM asistente_queries_fallidas 
     WHERE query_original LIKE '%tratamiento%6%'
     ORDER BY created_at DESC LIMIT 1;
     
     ESPERADO: Aparece el registro con:
     - query_original: "¿Cómo agrego un tratamiento cada 6 horas?"
     - resultado_tipo: "sin_respuesta"
     - rol_usuario: tu rol
     - cantidad_ocurrencias: 1
     
     Si aparece, auto-guardado funciona ✓

Opción B: Test directo a API

  POST /api_asistente_chat.php
  
  {
    "action": "buscar",
    "pregunta": "query que no existe xyz123abc"
  }
  
  Respuesta: tipo="sin_resultado" + sugerencias
  
  Luego en SQL:
  SELECT COUNT(*) FROM asistente_queries_fallidas WHERE query_original LIKE '%xyz123%';
  
  ESPERADO: COUNT = 1 (fue guardada)

Opción C: Incrementar contador

  Hacer 3 veces la misma pregunta sin respuesta
  
  SELECT query_original, cantidad_ocurrencias 
  FROM asistente_queries_fallidas 
  WHERE query_original = 'tu pregunta'
  ORDER BY created_at DESC LIMIT 1;
  
  ESPERADO: cantidad_ocurrencias = 3

// ════════════════════════════════════════════════
// TEST 4: Verificar endpoint admin
// ════════════════════════════════════════════════

Opción A: Usando curl / Postman

  POST https://tu-clinica.com/api_asistente_chat.php
  
  Body:
  {
    "action": "listar_queries_fallidas"
  }
  
  RESPUESTA ESPERADA:
  {
    "success": true,
    "total": X,
    "queries_fallidas": [
      {
        "id": 1,
        "query_original": "¿Cómo agrego tratamiento cada 6 horas?",
        "cantidad_ocurrencias": 3,
        "usuarios_diferentes": 1,
        "roles_afectados": "medico",
        "created_at": "2026-04-17 10:45:00",
        "sugerencia_creada": 0
      },
      ...
    ]
  }
  
  Si "success": true, endpoint funciona ✓

Opción B: Desde JavaScript

  fetch('/api_asistente_chat.php', {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({action: 'listar_queries_fallidas'})
  })
  .then(r => r.json())
  .then(data => console.log(data));
  
  ESPERADO: Consola muestra objeto con queries_fallidas array

// ════════════════════════════════════════════════
// TEST 5: Flujo completo (Integración)
// ════════════════════════════════════════════════

TEST: De pregunta fallida → admin ve → admin crea entrada → pregunta repite → responde

  PASO 1: Pregunta fallida (usuario)
    - Usuario pregunta: "¿Cómo agrego un medicamento cada 6 horas?"
    - Sistema: No encuentra
    - AUTO-GUARDA en asistente_queries_fallidas
  
  PASO 2: Admin ve en dashboard
    - Admin ejecuta: listar_queries_fallidas
    - Ve: "¿Cómo agrego un medicamento cada 6 horas?" (1 ocurrencia)
  
  PASO 3: Admin crea entrada nueva (manual por ahora)
    INSERT INTO asistente_conocimiento 
    (categoria, pregunta, respuesta, palabras_clave, orden)
    VALUES (
      'Historia Clínica',
      '¿Cómo agrego un medicamento con frecuencia?',
      'Dentro de la Receta Médica, busca el medicamento...',
      'medicamento manual cada 6 horas cada hora frecuencia',
      132
    );
  
  PASO 4: Admin agrega sinónimos (opcional, mejora búsqueda)
    INSERT INTO asistente_sinonimos (palabra_base, sinonimo, categoria) VALUES
    ('agrego', 'agrego', 'hc'),
    ('agrego', 'agregar', 'hc'),
    ('medicamento', 'medicamento', 'hc'),
    ('frecuencia', 'cada 6 horas', 'medicacion'),
    ('frecuencia', 'horario', 'medicacion');
  
  PASO 5: Usuario repite pregunta
    - Usuario pregunta: "¿Agrego medicamento cada 6 horas?"
    - Sistema: Busca con sinónimos
    - ENCUENTRA respuesta que admin agregó ✓
    - NO guarda en fallidas (fue exitosa)
  
  PASO 6: Admin marca como resuelta
    UPDATE asistente_queries_fallidas 
    SET sugerencia_creada = 1 
    WHERE query_original LIKE '%medicamento%horas%';
  
  RESULTADO: ✅ Loop de aprendizaje funciona

// ════════════════════════════════════════════════
// TEST 6: Rendimiento (sin regresar 504 errors)
// ════════════════════════════════════════════════

Búsqueda de "agendar" ANTES de Fase 1:
  - 1 búsqueda en BD
  - Tiempo: ~20ms
  
Búsqueda de "agendar" DESPUÉS de Fase 1:
  - 1 búsqueda en BD (conocimiento)
  - 1 búsqueda en tabla sinonimos (rápida, índice)
  - Tiempo: ~25-30ms (poco impacto)
  
TEST: Medir latencia

  1. Abrir DevTools (F12) → Network
  2. Hacer 5 preguntas seguidas
  3. Ver tiempo en /api_asistente_chat.php POST
  
  ESPERADO:
  - Promedio: 25-50ms
  - Max: <100ms
  - NO debería ver 504 errors
  - Si ves 504, reiniciar servidor o revisar conexión BD

// ════════════════════════════════════════════════
// TEST 7: Validar cero regresiones
// ════════════════════════════════════════════════

Funcionalidades que NO deben cambiar:

  1. Escalamiento a soporte sigue funcionando
     POST /api_asistente_chat.php
     {"action": "escalar", "pregunta": "...", "motivo": "sin_respuesta"}
     ESPERADO: {"success": true, "escalamiento_id": X}
  
  2. CRUD admin intacto
     - Crear entrada nueva
     - Editar entrada
     - Eliminar entrada
     ESPERADO: Todos los botones funcionan igual
  
  3. Respuesta exitosa sin cambios
     - Pregunta "¿Cómo abro la caja?" = DEBE seguir funcionando
     - Devuelve MISMA respuesta que antes
     ESPERADO: Tipo respuesta = "respuesta" (no "sin_resultado")

// ════════════════════════════════════════════════
// CHECKLIST DE VALIDACIÓN FINAL
// ════════════════════════════════════════════════

Antes de considerar "Fase 1 & 2 completa":

□ TEST 1: Tablas SQL existen (62+ sinónimos)
□ TEST 2: Búsqueda con sinónimos funciona ("programo" → encuentra "agendar")
□ TEST 3: Auto-guardado de queries fallidas funciona
□ TEST 4: Endpoint listar_queries_fallidas devuelve datos
□ TEST 5: Flujo completo: fallo → admin ve → crea entrada → funciona
□ TEST 6: Latencia <100ms, no hay 504 errors
□ TEST 7: Cero regresiones (escalar, CRUD, respuestas antiguas)

Si TODO pasa ✓:
  → Fase 1 & 2 LISTA PARA PRODUCCIÓN
  → Documentar en wiki/confluence
  → Comunicar a equipo médico: "Búsqueda mejorada con sinónimos"

Si algo falla ✗:
  → Revisar logs de PHP
  → Verificar conexión BD
  → Leer documentación CAMBIOS_PHP_DETALLADOS.js
  → Contactar dev

// ════════════════════════════════════════════════
// DESPUÉS: MONITOREO (SEMANAS 1-2)
// ════════════════════════════════════════════════

KPIs a trackear post-launch:

  1. % preguntas sin respuesta
     Query:
     SELECT 
       CAST(COUNT(*) * 100.0 / (SELECT COUNT(*) FROM asistente_queries_fallidas) AS DECIMAL(5,2)) as pct_fallo
     FROM asistente_queries_fallidas WHERE resultado_tipo = 'sin_respuesta';
     
     ANTES: ~40%
     ESPERADO DESPUÉS: ~15% (mejora de 25 puntos)

  2. Top 5 queries sin respuesta
     Query:
     SELECT query_original, cantidad_ocurrencias 
     FROM asistente_queries_fallidas 
     WHERE sugerencia_creada = 0 
     ORDER BY cantidad_ocurrencias DESC LIMIT 5;
     
     ACCIÓN: Admin revisa y crea entradas para top 3
  
  3. % de queries resueltas por admin
     Query:
     SELECT 
       COUNT(*) as total_fallidas,
       SUM(CASE WHEN sugerencia_creada = 1 THEN 1 ELSE 0 END) as resueltas,
       CAST(SUM(CASE WHEN sugerencia_creada = 1 THEN 1 ELSE 0 END) * 100.0 / COUNT(*) AS DECIMAL(5,2)) as pct_resueltas
     FROM asistente_queries_fallidas;
     
     META: Admin resuelve 70% en primera semana

*/

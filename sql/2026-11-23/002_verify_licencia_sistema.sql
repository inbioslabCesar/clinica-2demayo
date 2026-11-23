-- 2026-11-23 | Verificación de la suscripción del sistema (solo lectura)
SELECT TABLE_NAME FROM information_schema.TABLES
 WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME IN ('licencia_sistema', 'licencia_sistema_pagos');   -- esperado: 2 filas

SELECT activa, monto, moneda, periodicidad, dia_pago, proximo_vencimiento, dias_aviso, dias_gracia, prorroga_hasta
  FROM licencia_sistema;                                                                              -- vacío = sin avisos ni bloqueo

SELECT fecha_pago, monto, metodo, referencia, periodo_hasta FROM licencia_sistema_pagos ORDER BY id DESC LIMIT 10;

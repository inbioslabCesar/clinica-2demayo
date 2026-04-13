-- Guardrails de consistencia para cotizaciones (saldo/estado)
-- Fecha: 2026-04-03

START TRANSACTION;

-- 1) Reparar datos historicos inconsistentes
UPDATE cotizaciones
SET
  total_pagado = COALESCE(total_pagado, 0),
  saldo_pendiente = CASE
    WHEN estado IN ('pendiente', 'parcial') AND COALESCE(total, 0) > 0 AND COALESCE(total_pagado, 0) = 0 AND COALESCE(saldo_pendiente, 0) <= 0
      THEN COALESCE(total, 0)
    WHEN saldo_pendiente IS NULL
      THEN GREATEST(COALESCE(total, 0) - COALESCE(total_pagado, 0), 0)
    ELSE saldo_pendiente
  END,
  estado = CASE
    WHEN estado = 'anulada' THEN 'anulada'
    WHEN GREATEST(COALESCE(total, 0) - COALESCE(total_pagado, 0), 0) <= 0 THEN 'pagado'
    WHEN COALESCE(total_pagado, 0) > 0 THEN 'parcial'
    ELSE 'pendiente'
  END;

COMMIT;

-- 2) Trigger BEFORE INSERT: normaliza saldo y estado al crear cotizacion
DROP TRIGGER IF EXISTS bi_cotizaciones_saldo_guard;
DELIMITER $$
CREATE TRIGGER bi_cotizaciones_saldo_guard
BEFORE INSERT ON cotizaciones
FOR EACH ROW
BEGIN
  SET NEW.total_pagado = COALESCE(NEW.total_pagado, 0);

  IF NEW.saldo_pendiente IS NULL
     OR (COALESCE(NEW.saldo_pendiente, 0) <= 0
         AND COALESCE(NEW.total, 0) > 0
         AND COALESCE(NEW.total_pagado, 0) = 0
         AND COALESCE(NEW.estado, 'pendiente') IN ('pendiente', 'parcial')) THEN
    SET NEW.saldo_pendiente = COALESCE(NEW.total, 0);
  END IF;

  IF COALESCE(NEW.estado, '') <> 'anulada' THEN
    IF COALESCE(NEW.saldo_pendiente, 0) <= 0 THEN
      SET NEW.estado = 'pagado';
    ELSEIF COALESCE(NEW.total_pagado, 0) > 0 THEN
      SET NEW.estado = 'parcial';
    ELSE
      SET NEW.estado = 'pendiente';
    END IF;
  END IF;
END$$
DELIMITER ;

-- 3) Trigger BEFORE UPDATE: mantiene estado coherente con total_pagado/saldo
DROP TRIGGER IF EXISTS bu_cotizaciones_saldo_guard;
DELIMITER $$
CREATE TRIGGER bu_cotizaciones_saldo_guard
BEFORE UPDATE ON cotizaciones
FOR EACH ROW
BEGIN
  SET NEW.total_pagado = COALESCE(NEW.total_pagado, 0);

  IF NEW.saldo_pendiente IS NULL THEN
    SET NEW.saldo_pendiente = GREATEST(COALESCE(NEW.total, 0) - COALESCE(NEW.total_pagado, 0), 0);
  END IF;

  IF COALESCE(NEW.estado, '') <> 'anulada' THEN
    IF COALESCE(NEW.saldo_pendiente, 0) <= 0 THEN
      SET NEW.estado = 'pagado';
    ELSEIF COALESCE(NEW.total_pagado, 0) > 0 THEN
      SET NEW.estado = 'parcial';
    ELSE
      SET NEW.estado = 'pendiente';
    END IF;
  END IF;
END$$
DELIMITER ;

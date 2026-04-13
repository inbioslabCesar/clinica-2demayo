-- Ejecutar DESPUES de importar poli2demayo.hostinger.import_safe.sql
-- Compatible con Hostinger (sin DEFINER root@localhost)

SET NAMES utf8mb4;

DROP TRIGGER IF EXISTS bi_cotizaciones_saldo_guard;
DROP TRIGGER IF EXISTS bu_cotizaciones_saldo_guard;

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

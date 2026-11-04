-- =====================================================================
--  005 — Notas crédito
--
--  Una factura validada por la DIAN no se borra ni se edita: se corrige
--  con una nota crédito que la referencia por su número. La orden pasa
--  a 'anulada' pero conserva sus datos de factura, porque la factura
--  sigue existiendo ante la DIAN: lo que cambia es que queda corregida.
--
--  Idempotente.
-- =====================================================================

-- Número de la nota crédito (prefijo + consecutivo del rango DIAN).
SET @e := (SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='facturacion_ordenes'
      AND COLUMN_NAME='nota_credito_number');
SET @s := IF(@e=0,
  'ALTER TABLE facturacion_ordenes ADD COLUMN nota_credito_number VARCHAR(50) NULL AFTER factus_datos',
  'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;

-- CUDE: el equivalente al CUFE para notas crédito y débito.
SET @e := (SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='facturacion_ordenes'
      AND COLUMN_NAME='nota_credito_cude');
SET @s := IF(@e=0,
  'ALTER TABLE facturacion_ordenes ADD COLUMN nota_credito_cude VARCHAR(100) NULL AFTER nota_credito_number',
  'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;

SET @e := (SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='facturacion_ordenes'
      AND COLUMN_NAME='nota_credito_url');
SET @s := IF(@e=0,
  'ALTER TABLE facturacion_ordenes ADD COLUMN nota_credito_url VARCHAR(600) NULL AFTER nota_credito_cude',
  'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;

-- Por qué se anuló: queda como constancia de la decisión.
SET @e := (SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='facturacion_ordenes'
      AND COLUMN_NAME='nota_credito_motivo');
SET @s := IF(@e=0,
  'ALTER TABLE facturacion_ordenes ADD COLUMN nota_credito_motivo VARCHAR(500) NULL AFTER nota_credito_url',
  'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;

SET @e := (SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='facturacion_ordenes'
      AND COLUMN_NAME='nota_credito_at');
SET @s := IF(@e=0,
  'ALTER TABLE facturacion_ordenes ADD COLUMN nota_credito_at DATETIME NULL AFTER nota_credito_motivo',
  'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;

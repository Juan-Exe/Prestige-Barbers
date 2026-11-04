-- =====================================================================
--  003 — Datos fiscales del cliente
--
--  La factura electrónica exige identificar al comprador ante la DIAN.
--  Estas columnas guardan lo que el cliente escribe al pagar, para no
--  pedírselo de nuevo en cada compra.
--
--  Idempotente: comprueba si la columna existe antes de añadirla,
--  porque MariaDB no admite ADD COLUMN IF NOT EXISTS en todas las
--  versiones.
-- =====================================================================

-- tipo_documento: código DIAN. "13" cédula de ciudadanía, "31" NIT,
-- "22" cédula de extranjería, "41" pasaporte.
SET @existe := (
    SELECT COUNT(*) FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = 'usuarios'
       AND COLUMN_NAME = 'tipo_documento'
);
SET @sql := IF(@existe = 0,
    'ALTER TABLE usuarios ADD COLUMN tipo_documento VARCHAR(2) NULL DEFAULT ''13'' AFTER telefono',
    'SELECT ''tipo_documento ya existe'' AS aviso');
PREPARE st FROM @sql; EXECUTE st; DEALLOCATE PREPARE st;

-- documento: número sin dígito de verificación ni puntos.
SET @existe := (
    SELECT COUNT(*) FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = 'usuarios'
       AND COLUMN_NAME = 'documento'
);
SET @sql := IF(@existe = 0,
    'ALTER TABLE usuarios ADD COLUMN documento VARCHAR(30) NULL AFTER tipo_documento',
    'SELECT ''documento ya existe'' AS aviso');
PREPARE st FROM @sql; EXECUTE st; DEALLOCATE PREPARE st;

-- Dirección y municipio son opcionales para la DIAN, pero mejoran la
-- factura cuando se tienen.
SET @existe := (
    SELECT COUNT(*) FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = 'usuarios'
       AND COLUMN_NAME = 'direccion'
);
SET @sql := IF(@existe = 0,
    'ALTER TABLE usuarios ADD COLUMN direccion VARCHAR(255) NULL AFTER documento',
    'SELECT ''direccion ya existe'' AS aviso');
PREPARE st FROM @sql; EXECUTE st; DEALLOCATE PREPARE st;

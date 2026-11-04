-- =====================================================================
--  004 — Datos completos de la factura electrónica
--
--  El Art. 617 del Estatuto Tributario y el anexo técnico de la DIAN
--  exigen bastante más que el número y el CUFE: la resolución de
--  numeración, el QR de consulta, el desglose de impuestos y los datos
--  del emisor y del comprador.
--
--  Factus los devuelve todos en GET /v2/bills/:number, pero solo se
--  guardaban tres. Estas columnas recogen el resto.
--
--  Idempotente.
-- =====================================================================

-- Enlace del QR de la DIAN. Lleva el CUFE y permite verificar la
-- factura en catalogo-vpfe.dian.gov.co.
SET @e := (SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='facturacion_ordenes'
      AND COLUMN_NAME='factus_qr_url');
SET @s := IF(@e=0,
  'ALTER TABLE facturacion_ordenes ADD COLUMN factus_qr_url VARCHAR(600) NULL AFTER factus_public_url',
  'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;

-- Resolución de numeración autorizada por la DIAN, con su prefijo y
-- rango: es obligatoria en la representación gráfica.
SET @e := (SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='facturacion_ordenes'
      AND COLUMN_NAME='factus_resolucion');
SET @s := IF(@e=0,
  'ALTER TABLE facturacion_ordenes ADD COLUMN factus_resolucion VARCHAR(100) NULL AFTER factus_qr_url',
  'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;

-- La respuesta completa de Factus, tal cual. Guardarla evita tener que
-- volver a pedirla y deja constancia de lo que la DIAN validó.
SET @e := (SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='facturacion_ordenes'
      AND COLUMN_NAME='factus_datos');
SET @s := IF(@e=0,
  'ALTER TABLE facturacion_ordenes ADD COLUMN factus_datos JSON NULL AFTER factus_resolucion',
  'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;

-- Brief mínimo capturado una sola vez al enviar un intake Starter/Pro. Da al
-- operador y al agente codificador contexto real (contacto, negocio,
-- objetivo del sitio) sin pedir todavía contenido fino de catálogo/galería,
-- que se recaba en un segundo contacto ya con el proyecto aprobado.
--
-- Las columnas requeridas se agregan con DEFAULT '' por compatibilidad con
-- filas existentes (intakes previos a esta migración); la aplicación exige
-- valores no vacíos para envíos nuevos vía `createPackageIntakeSchema`.

ALTER TABLE lmw_package_intakes ADD COLUMN contact_name TEXT NOT NULL DEFAULT '';
ALTER TABLE lmw_package_intakes ADD COLUMN contact_phone TEXT NOT NULL DEFAULT '';
ALTER TABLE lmw_package_intakes ADD COLUMN business_name TEXT NOT NULL DEFAULT '';
ALTER TABLE lmw_package_intakes ADD COLUMN business_summary TEXT NOT NULL DEFAULT '';
ALTER TABLE lmw_package_intakes ADD COLUMN site_goal TEXT NOT NULL DEFAULT '';
ALTER TABLE lmw_package_intakes ADD COLUMN style_preference TEXT;
ALTER TABLE lmw_package_intakes ADD COLUMN reference_notes TEXT;

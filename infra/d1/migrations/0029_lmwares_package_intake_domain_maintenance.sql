-- Campo de dominio personalizado y preferencia (informativa) de mantenimiento,
-- capturados en el brief del intake para que el cliente no se lleve una
-- sorpresa al final. La preferencia de mantenimiento NO fija el precio
-- contractual; el operador sigue emitiendo el monto final en la oferta.

ALTER TABLE lmw_package_intakes ADD COLUMN custom_domain_preference TEXT;
ALTER TABLE lmw_package_intakes ADD COLUMN maintenance_plan_preference TEXT NOT NULL DEFAULT 'later';
ALTER TABLE lmw_package_intakes ADD COLUMN maintenance_security_add_on INTEGER NOT NULL DEFAULT 0;

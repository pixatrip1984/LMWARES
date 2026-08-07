-- Recupera la decisión de mantenimiento de ofertas creadas antes de 0030.
-- Las ofertas nuevas con "configurar luego" permanecen NULL: sólo se tocan
-- registros que ya tenían una preferencia explícita o una suscripción creada.

UPDATE lmw_commercial_offers
SET maintenance_plan_selected = (
  SELECT CASE
    WHEN i.maintenance_plan_preference IN ('none', 'basic', 'advanced')
      THEN i.maintenance_plan_preference
    WHEN lmw_commercial_offers.monthly_amount_cents = 29900
      THEN 'basic'
    WHEN lmw_commercial_offers.monthly_amount_cents = 59900
      THEN 'advanced'
    WHEN EXISTS (
      SELECT 1
      FROM lmw_maintenance_subscriptions s
      WHERE s.commercial_offer_id = lmw_commercial_offers.id
        AND s.status IN (
          'creating',
          'creation_failed',
          'pending_authorization',
          'active',
          'payment_attention',
          'paused'
        )
    )
      THEN CASE
        WHEN lmw_commercial_offers.monthly_amount_cents >= 59900 THEN 'advanced'
        ELSE 'basic'
      END
    ELSE NULL
  END
  FROM lmw_package_intakes i
  WHERE i.id = lmw_commercial_offers.intake_id
)
WHERE maintenance_plan_selected IS NULL
  AND (
    EXISTS (
      SELECT 1
      FROM lmw_package_intakes i
      WHERE i.id = lmw_commercial_offers.intake_id
        AND i.maintenance_plan_preference IN ('none', 'basic', 'advanced')
    )
    OR EXISTS (
      SELECT 1
      FROM lmw_maintenance_subscriptions s
      WHERE s.commercial_offer_id = lmw_commercial_offers.id
        AND s.status IN (
          'creating',
          'creation_failed',
          'pending_authorization',
          'active',
          'payment_attention',
          'paused',
          'canceled',
          'disputed'
        )
    )
  );

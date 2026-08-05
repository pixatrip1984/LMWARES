PRAGMA foreign_keys = ON;

INSERT INTO lmw_users (id, email, name, created_at, updated_at)
VALUES ('maintenance-user', 'maintenance-validator@example.com', 'Maintenance Validator', '2026-08-03T00:00:00.000Z', '2026-08-03T00:00:00.000Z');

INSERT INTO lmwares_projects (
  id, name, business, category, status_label, phase, progress, priority, health,
  repo_path, branch, preview_url, last_refresh, developer, due, day, days_left,
  next_action, seed_prompt, tags, preview, phases, registry_source,
  first_seen_at, last_scanned_at, created_at, updated_at
) VALUES (
  'maintenance-project', 'Maintenance Fixture', 'LMWares', 'validation', 'Ready',
  'validation', 100, 'Normal', 'on-track', 'C:\\synthetic\\maintenance', 'validation',
  'https://fixture.lmwares.com', '2026-08-03T00:00:00.000Z', 'validator',
  '2026-08-03', 1, 0, 'Validate maintenance', 'Synthetic fixture', '[]', '{}', '[]',
  'maintenance-validator', '2026-08-03T00:00:00.000Z', '2026-08-03T00:00:00.000Z',
  '2026-08-03T00:00:00.000Z', '2026-08-03T00:00:00.000Z'
);

INSERT INTO lmw_package_intakes (
  id, submission_key, user_id, plan, modules, marketing, status,
  estimated_implementation_cents, estimated_monthly_cents, currency,
  pricing_version, maintenance_start_policy, package_snapshot, submitted_at,
  created_at, updated_at
) VALUES
  ('intake-good', 'submission-good', 'maintenance-user', 'starter', '["landing"]', 0, 'converted', 1000, 500, 'MXN', 'fixture-v1', 'on_go_live', '{}', '2026-08-03T00:00:00.000Z', '2026-08-03T00:00:00.000Z', '2026-08-03T00:00:00.000Z'),
  ('intake-no-project', 'submission-no-project', 'maintenance-user', 'starter', '["landing"]', 0, 'converted', 1000, 500, 'MXN', 'fixture-v1', 'on_go_live', '{}', '2026-08-03T00:00:00.000Z', '2026-08-03T00:00:00.000Z', '2026-08-03T00:00:00.000Z'),
  ('intake-unpaid', 'submission-unpaid', 'maintenance-user', 'starter', '["landing"]', 0, 'converted', 1000, 500, 'MXN', 'fixture-v1', 'on_go_live', '{}', '2026-08-03T00:00:00.000Z', '2026-08-03T00:00:00.000Z', '2026-08-03T00:00:00.000Z'),
  ('intake-review', 'submission-review', 'maintenance-user', 'starter', '["landing"]', 0, 'converted', 1000, 500, 'MXN', 'fixture-v1', 'on_go_live', '{}', '2026-08-03T00:00:00.000Z', '2026-08-03T00:00:00.000Z', '2026-08-03T00:00:00.000Z'),
  ('intake-offer', 'submission-offer', 'maintenance-user', 'starter', '["landing"]', 0, 'converted', 1000, 500, 'MXN', 'fixture-v1', 'on_go_live', '{}', '2026-08-03T00:00:00.000Z', '2026-08-03T00:00:00.000Z', '2026-08-03T00:00:00.000Z'),
  ('intake-building', 'submission-building', 'maintenance-user', 'starter', '["landing"]', 0, 'converted', 1000, 500, 'MXN', 'fixture-v1', 'on_go_live', '{}', '2026-08-03T00:00:00.000Z', '2026-08-03T00:00:00.000Z', '2026-08-03T00:00:00.000Z'),
  ('intake-one-time', 'submission-one-time', 'maintenance-user', 'starter', '["landing","catalog","quote"]', 0, 'converted', 1090000, 0, 'MXN', 'fixture-v1', 'on_go_live', '{}', '2026-08-03T00:00:00.000Z', '2026-08-03T00:00:00.000Z', '2026-08-03T00:00:00.000Z');

INSERT INTO lmw_commercial_offers (
  id, intake_id, user_id, version, status, plan, modules, marketing,
  implementation_amount_cents, monthly_amount_cents, currency, scope_summary,
  implementation_description, recurring_description, maintenance_start_policy,
  terms_version, terms_snapshot, valid_until, issued_by, issued_at, accepted_at,
  created_at, updated_at
) VALUES
  ('offer-good', 'intake-good', 'maintenance-user', 1, 'accepted', 'starter', '["landing"]', 0, 1000, 500, 'MXN', 'Fixture', 'Fixture', 'Fixture', 'on_go_live', 'fixture-v1', '{}', '2027-01-01T00:00:00.000Z', 'validator', '2026-08-03T00:00:00.000Z', '2026-08-03T00:00:00.000Z', '2026-08-03T00:00:00.000Z', '2026-08-03T00:00:00.000Z'),
  ('offer-no-project', 'intake-no-project', 'maintenance-user', 1, 'accepted', 'starter', '["landing"]', 0, 1000, 500, 'MXN', 'Fixture', 'Fixture', 'Fixture', 'on_go_live', 'fixture-v1', '{}', '2027-01-01T00:00:00.000Z', 'validator', '2026-08-03T00:00:00.000Z', '2026-08-03T00:00:00.000Z', '2026-08-03T00:00:00.000Z', '2026-08-03T00:00:00.000Z'),
  ('offer-unpaid', 'intake-unpaid', 'maintenance-user', 1, 'accepted', 'starter', '["landing"]', 0, 1000, 500, 'MXN', 'Fixture', 'Fixture', 'Fixture', 'on_go_live', 'fixture-v1', '{}', '2027-01-01T00:00:00.000Z', 'validator', '2026-08-03T00:00:00.000Z', '2026-08-03T00:00:00.000Z', '2026-08-03T00:00:00.000Z', '2026-08-03T00:00:00.000Z'),
  ('offer-review', 'intake-review', 'maintenance-user', 1, 'accepted', 'starter', '["landing"]', 0, 1000, 500, 'MXN', 'Fixture', 'Fixture', 'Fixture', 'on_go_live', 'fixture-v1', '{}', '2027-01-01T00:00:00.000Z', 'validator', '2026-08-03T00:00:00.000Z', '2026-08-03T00:00:00.000Z', '2026-08-03T00:00:00.000Z', '2026-08-03T00:00:00.000Z'),
  ('offer-offer', 'intake-offer', 'maintenance-user', 1, 'superseded', 'starter', '["landing"]', 0, 1000, 500, 'MXN', 'Fixture', 'Fixture', 'Fixture', 'on_go_live', 'fixture-v1', '{}', '2027-01-01T00:00:00.000Z', 'validator', '2026-08-03T00:00:00.000Z', NULL, '2026-08-03T00:00:00.000Z', '2026-08-03T00:00:00.000Z'),
  ('offer-building', 'intake-building', 'maintenance-user', 1, 'accepted', 'starter', '["landing"]', 0, 1000, 500, 'MXN', 'Fixture', 'Fixture', 'Fixture', 'on_go_live', 'fixture-v1', '{}', '2027-01-01T00:00:00.000Z', 'validator', '2026-08-03T00:00:00.000Z', '2026-08-03T00:00:00.000Z', '2026-08-03T00:00:00.000Z', '2026-08-03T00:00:00.000Z'),
  ('offer-one-time', 'intake-one-time', 'maintenance-user', 1, 'accepted', 'starter', '["landing","catalog","quote"]', 0, 1090000, 0, 'MXN', 'MG Seguros', 'Implementación única', 'Mantenimiento no contratado', 'on_go_live', 'fixture-v1', '{}', '2027-01-01T00:00:00.000Z', 'validator', '2026-08-03T00:00:00.000Z', '2026-08-03T00:00:00.000Z', '2026-08-03T00:00:00.000Z', '2026-08-03T00:00:00.000Z');

INSERT INTO lmw_billing_orders (
  id, purpose, commercial_offer_id, intake_id, user_id, status, amount_cents,
  currency, order_snapshot, external_reference, provider,
  payment_review_required, created_at, updated_at
) VALUES
  ('billing-good', 'implementation', 'offer-good', 'intake-good', 'maintenance-user', 'paid', 1000, 'MXN', '{}', 'billing-good-ref', 'mercado_pago', 0, '2026-08-03T00:00:00.000Z', '2026-08-03T00:00:00.000Z'),
  ('billing-no-project', 'implementation', 'offer-no-project', 'intake-no-project', 'maintenance-user', 'paid', 1000, 'MXN', '{}', 'billing-no-project-ref', 'mercado_pago', 0, '2026-08-03T00:00:00.000Z', '2026-08-03T00:00:00.000Z'),
  ('billing-unpaid', 'implementation', 'offer-unpaid', 'intake-unpaid', 'maintenance-user', 'payment_pending', 1000, 'MXN', '{}', 'billing-unpaid-ref', 'mercado_pago', 0, '2026-08-03T00:00:00.000Z', '2026-08-03T00:00:00.000Z'),
  ('billing-review', 'implementation', 'offer-review', 'intake-review', 'maintenance-user', 'paid', 1000, 'MXN', '{}', 'billing-review-ref', 'mercado_pago', 1, '2026-08-03T00:00:00.000Z', '2026-08-03T00:00:00.000Z'),
  ('billing-offer', 'implementation', 'offer-offer', 'intake-offer', 'maintenance-user', 'paid', 1000, 'MXN', '{}', 'billing-offer-ref', 'mercado_pago', 0, '2026-08-03T00:00:00.000Z', '2026-08-03T00:00:00.000Z'),
  ('billing-building', 'implementation', 'offer-building', 'intake-building', 'maintenance-user', 'paid', 1000, 'MXN', '{}', 'billing-building-ref', 'mercado_pago', 0, '2026-08-03T00:00:00.000Z', '2026-08-03T00:00:00.000Z'),
  ('billing-one-time', 'implementation', 'offer-one-time', 'intake-one-time', 'maintenance-user', 'paid', 1090000, 'MXN', '{}', 'billing-one-time-ref', 'mercado_pago', 0, '2026-08-03T00:00:00.000Z', '2026-08-03T00:00:00.000Z');

INSERT INTO lmw_starter_work_orders (
  id, billing_order_id, intake_id, commercial_offer_id, user_id, project_id,
  status, work_snapshot, created_at, updated_at
) VALUES
  ('work-good', 'billing-good', 'intake-good', 'offer-good', 'maintenance-user', 'maintenance-project', 'ready_to_publish', '{}', '2026-08-03T00:00:00.000Z', '2026-08-03T00:00:00.000Z'),
  ('work-no-project', 'billing-no-project', 'intake-no-project', 'offer-no-project', 'maintenance-user', NULL, 'ready_to_publish', '{}', '2026-08-03T00:00:00.000Z', '2026-08-03T00:00:00.000Z'),
  ('work-unpaid', 'billing-unpaid', 'intake-unpaid', 'offer-unpaid', 'maintenance-user', 'maintenance-project', 'ready_to_publish', '{}', '2026-08-03T00:00:00.000Z', '2026-08-03T00:00:00.000Z'),
  ('work-review', 'billing-review', 'intake-review', 'offer-review', 'maintenance-user', 'maintenance-project', 'ready_to_publish', '{}', '2026-08-03T00:00:00.000Z', '2026-08-03T00:00:00.000Z'),
  ('work-offer', 'billing-offer', 'intake-offer', 'offer-offer', 'maintenance-user', 'maintenance-project', 'ready_to_publish', '{}', '2026-08-03T00:00:00.000Z', '2026-08-03T00:00:00.000Z'),
  ('work-building', 'billing-building', 'intake-building', 'offer-building', 'maintenance-user', 'maintenance-project', 'in_build', '{}', '2026-08-03T00:00:00.000Z', '2026-08-03T00:00:00.000Z'),
  ('work-one-time', 'billing-one-time', 'intake-one-time', 'offer-one-time', 'maintenance-user', 'maintenance-project', 'ready_to_publish', '{"plan":"starter"}', '2026-08-03T00:00:00.000Z', '2026-08-03T00:00:00.000Z');

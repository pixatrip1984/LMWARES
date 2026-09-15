# Payment success return: browser regression specification

Prerequisites: start the Public Web and Public API locally, backed by the
single-instance Miniflare/D1 fixture; seed `CLIENT_A`, a valid session cookie,
and `ORDER_A` in `ready` or `payment_pending`; inject the local Mercado Pago
transport mock. Do not use a remote provider or database.

## S01: direct navigation

Navigate as `CLIENT_A` to `/pago/implementacion/:ORDER_A_ID`. Wait for normal
page initialization without clicking any button. Assert the order remains
non-paid in that same D1 instance and record requests (the initial order read
is expected; payment reconciliation is not).

## S02: repeated return

Reload the same URL five times. Assert no billing payment attempt, webhook
event, activation, or order-status transition is created.

## S03: browser-controlled values

Repeat S01 with arbitrary query keys and values such as `status=approved`,
`payment_id=synthetic`, `external_reference=synthetic`, and an unrelated ID.
Assert the order remains non-paid.

## S04: explicit reconciliation

Click the page's explicit reconciliation action. The request may contain only
the order identifier; the backend must consult the injected provider mock and
decide the result. With a non-approved mock, assert the order remains
non-paid. With an approved, correctly-bound mock, assert the backend—not the
browser response parameters—changes the order.

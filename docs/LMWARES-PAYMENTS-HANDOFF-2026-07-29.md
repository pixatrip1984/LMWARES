# LMWares Payments handoff — 2026-07-29

## Outcome

Checkout Pro and Subscriptions now use separate Mercado Pago applications,
Access Tokens and Webhook signing secrets. The one-time payment flow remains
isolated from the recurring flow.

The recurring sandbox is now validated end to end with a Seller TEST
application and a separate Buyer TEST account. Mercado Pago authorized the
subscription and D1 persists it as active with the next monthly debit.

## Provider configuration

- Checkout Pro: existing `lmwares` application.
- Subscriptions sandbox: aplicación `pagos online suscripciones`, creada dentro
  de la cuenta Seller TEST.
- Subscriptions sandbox application ID: `4528337183430892`.
- La aplicación `LMWares Suscripciones` (`7312500347579301`) pertenece a la
  cuenta real y no se usa para esta prueba Seller TEST + Buyer TEST.
- Callback: `https://api.lmwares.com/payments/webhooks/mercado-pago`.
- Test topic selected: `Planes y suscripciones`.
- Cloudflare secret names:
  - `MERCADO_PAGO_ACCESS_TOKEN`
  - `MERCADO_PAGO_WEBHOOK_SECRET`
  - `MERCADO_PAGO_WEBHOOK_TEST_SECRET`
  - `MERCADO_PAGO_SUBSCRIPTIONS_ACCESS_TOKEN`
  - `MERCADO_PAGO_SUBSCRIPTIONS_TEST_PAYER_EMAIL`
  - `MERCADO_PAGO_SUBSCRIPTIONS_WEBHOOK_TEST_SECRET`

No secret value is stored in this repository.

## Reproducible evidence

Technical proposal:

- Proposal: `947134b6-e609-41aa-9476-ed9b5c9ad611`
- Subscription: `1e4f6134-cb95-49c3-9c86-d9ce56250efa`
- Amount: MXN 10 monthly.
- D1 state after browser authorization: `active`.
- Provider state: `authorized`.
- Next debit: 2026-08-30.
- The initial authorization does not create a charge row; the first scheduled
  debit is expected to create it.

An automatically generated `TEST-` token reproduced the original provider
failure:

```text
TOKEN_KIND=TEST
REQUEST_SCOPE=default
SEARCH_STATUS=200
SEARCH_MATCHES=0
CREATE_STATUS=500
CREATE_RESULT=provider_error
CREATE_ERROR=Internal server error
```

Adding `X-scope: stage` is not valid for this automatically generated token:

```text
TOKEN_KIND=TEST
SEARCH_STATUS=403
SEARCH_ERROR=At least one policy returned UNAUTHORIZED.
```

The successful pairing used the `APP_USR-` production credential owned by the
Seller TEST account and the actual generated email from the Buyer TEST account:

```text
TOKEN_KIND=APP_USR
REQUEST_SCOPE=default
SEARCH_STATUS=200
SEARCH_MATCHES=0
CREATE_STATUS=201
CREATE_RESULT=success
PREAPPROVAL_STATUS=pending
```

Use the safe reproducer without putting the token in shell history. Replace the
placeholder with the Buyer TEST email; never commit that value:

```powershell
$subscriptionId = Read-Host 'UUID interno de la suscripción'
$buyerEmail = Read-Host 'Correo generado del Buyer TEST'
$proposalId = Read-Host 'UUID de la propuesta'
pwsh -NoProfile -File .\scripts\diagnose-mercado-pago-subscription.ps1 `
  -ExternalReference $subscriptionId `
  -PayerEmail $buyerEmail `
  -ProposalId $proposalId
```

The script prompts for the token as a hidden value, searches first to avoid a
duplicate, returns to the matching proposal and prints only sanitized provider
results.

## Implemented safeguards

- Recurring API calls cannot fall back to the Checkout Pro token.
- Each Mercado Pago application has independent Webhook signature bindings.
- Failed creation records a sanitized diagnostic in `provider_status`.
- A retry clears the prior diagnostic before claiming the subscription again.
- Provider resources are searched by external reference before creation.
- The technical recurring minimum is MXN 10.
- Test creation requires `MERCADO_PAGO_SUBSCRIPTIONS_TEST_PAYER_EMAIL`; no
  synthetic or real-account payer is hardcoded.
- The hosted return URL points to `/pago/{proposalId}`.
- A provider-verified webhook smoke test returned HTTP 200 and persisted a
  `processed` subscription event.
- Public API deployment `0b43f04a-8c8a-4632-b6a8-a25c27bbf9af` is active at
  100%; `https://api.lmwares.com/health` returned HTTP 200 after deployment.

## Next gate

1. In the Seller TEST application, configure the callback and select `Planes y
   suscripciones`.
2. Replace `MERCADO_PAGO_SUBSCRIPTIONS_WEBHOOK_TEST_SECRET` with the signing
   secret from that exact Seller TEST application.
3. Confirm a provider-originated `subscription_preapproval` notification is
   delivered and recorded with a validated signature.
4. Keep the subscription active until its first scheduled debit to validate
   `subscription_authorized_payment`, charge persistence and retry state.
5. Do not enable real production charges until test mode is removed and the
   commercial amount, cancellation and notification policies are approved.

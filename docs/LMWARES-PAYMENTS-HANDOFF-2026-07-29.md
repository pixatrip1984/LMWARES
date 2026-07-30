# LMWares Payments handoff — 2026-07-29

## Outcome

Checkout Pro and Subscriptions now use separate Mercado Pago applications,
Access Tokens and Webhook signing secrets. The one-time payment flow remains
isolated from the recurring flow.

The recurring sandbox is blocked outside LMWares: Mercado Pago accepts the
test token for `GET /preapproval/search` but returns `500 Internal server error`
for the minimal documented `POST /preapproval` request.

## Provider configuration

- Checkout Pro: existing `lmwares` application.
- Subscriptions: `LMWares Suscripciones`.
- Subscriptions application ID: `7312500347579301`.
- Callback: `https://api.lmwares.com/payments/webhooks/mercado-pago`.
- Test topic selected: `Planes y suscripciones`.
- Cloudflare secret names:
  - `MERCADO_PAGO_ACCESS_TOKEN`
  - `MERCADO_PAGO_WEBHOOK_SECRET`
  - `MERCADO_PAGO_WEBHOOK_TEST_SECRET`
  - `MERCADO_PAGO_SUBSCRIPTIONS_ACCESS_TOKEN`
  - `MERCADO_PAGO_SUBSCRIPTIONS_WEBHOOK_TEST_SECRET`

No secret value is stored in this repository.

## Reproducible evidence

Technical proposal:

- Proposal: `947134b6-e609-41aa-9476-ed9b5c9ad611`
- Subscription: `1e4f6134-cb95-49c3-9c86-d9ce56250efa`
- Amount: MXN 10 monthly.
- D1 state after failure: `creation_failed`, without a provider preapproval ID.

Direct diagnostic, outside the frontend and Worker:

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

Use the safe reproducer without putting the token in shell history:

```powershell
pwsh -NoProfile -File .\scripts\diagnose-mercado-pago-subscription.ps1 `
  -ExternalReference 1e4f6134-cb95-49c3-9c86-d9ce56250efa
```

The script prompts for the token as a hidden value, searches first to avoid a
duplicate and prints only sanitized provider results.

## Implemented safeguards

- Recurring API calls cannot fall back to the Checkout Pro token.
- Each Mercado Pago application has independent Webhook signature bindings.
- Failed creation records a sanitized diagnostic in `provider_status`.
- A retry clears the prior diagnostic before claiming the subscription again.
- Provider resources are searched by external reference before creation.
- The technical recurring minimum is MXN 10.

## Next gate

Do not keep changing the LMWares request body: the same minimal request fails
directly against Mercado Pago.

Recommended path:

1. Send the application ID and the sanitized reproduction above to Mercado
   Pago support.
2. Continue the Free flow and Starter module validation while the provider
   reviews the sandbox.
3. Retry the direct diagnostic before returning to the browser flow.
4. Use production credentials and a real recurring charge only after explicit
   approval, with the amount and cancellation procedure agreed in advance.

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import ts from 'typescript';

const source = readFileSync(new URL('./starter-notification-email.ts', import.meta.url), 'utf8')
  .replace(
    "import { AppError } from '@starter/domain';",
    `class AppError extends Error {
      constructor(code, message) {
        super(message);
        this.code = code;
      }
    }`,
  );
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText;
const moduleUrl = `data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`;
const { buildStarterPublishedEmail } = await import(moduleUrl);

const input = {
  siteName: 'Ferretería García Industrial',
  publicUrl: 'https://ferreteria-garcia.lmwares.com/',
  workOrderId: 'work-123',
  intakeId: 'intake-123',
  projectId: 'project-123',
  billingOrderId: 'billing-123',
  commercialOfferId: 'offer-123',
  maintenanceSubscriptionId: 'subscription-123',
  monthlyAmountCents: 14900,
  notificationId: 'notification-123',
  recipientEmail: 'cliente@example.com',
  publishedAt: '2026-07-31T05:00:00.000Z',
  supportEmail: 'soporte@lmwares.com',
  accountUrl: 'https://contratar.lmwares.com/configurar',
};

test('builds a complete Starter publication receipt', () => {
  const email = buildStarterPublishedEmail(input);
  assert.match(email.subject, /Ferretería García Industrial ya está publicado/);
  assert.match(email.text, /Orden de trabajo: work-123/);
  assert.match(email.text, /Suscripción de mantenimiento: subscription-123/);
  assert.match(email.text, /cancelación de cobros futuros/);
  assert.match(email.html, /ferreteria-garcia\.lmwares\.com/);
  assert.match(email.html, /Abrir mi cuenta LMWares/);
});

test('escapes customer-controlled HTML', () => {
  const email = buildStarterPublishedEmail({ ...input, siteName: '<script>alert(1)</script>' });
  assert.doesNotMatch(email.html, /<script>/);
  assert.match(email.html, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
});

test('rejects external publication URLs and invalid amounts', () => {
  assert.throws(
    () => buildStarterPublishedEmail({ ...input, publicUrl: 'https://example.com/' }),
    /URL publicada válida/,
  );
  assert.throws(
    () => buildStarterPublishedEmail({ ...input, monthlyAmountCents: 0 }),
    /mensualidad.*no es válida/,
  );
});

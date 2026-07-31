import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import ts from 'typescript';

const source = readFileSync(new URL('./free-notification-email.ts', import.meta.url), 'utf8')
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
  compilerOptions: {
    module: ts.ModuleKind.ESNext,
    target: ts.ScriptTarget.ES2022,
  },
}).outputText;
const moduleUrl = `data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`;
const { buildFreePublishedEmail } = await import(moduleUrl);

const input = {
  siteName: 'Pepe Pinturas',
  publicUrl: 'https://pepe-pinturas-auto-0731.lmwares.com/',
  referenceId: 'intake-123',
  notificationId: 'notification-456',
  recipientEmail: 'cliente@example.com',
  publishedAt: '2026-07-31T05:00:00.000Z',
  supportEmail: 'soporte@lmwares.com',
};

test('builds a complete Free delivery receipt', () => {
  const email = buildFreePublishedEmail(input);

  assert.match(email.subject, /Pepe Pinturas ya está publicada/);
  assert.match(email.text, /¡Gracias por probar LMWares!/);
  assert.match(email.text, /Referencia: intake-123/);
  assert.match(email.text, /Notificación: notification-456/);
  assert.match(email.text, /no crea una suscripción ni genera cobros recurrentes/);
  assert.match(email.html, /soporte@lmwares\.com/);
  assert.match(email.html, /pepe-pinturas-auto-0731\.lmwares\.com/);
});

test('escapes customer-controlled HTML in the message', () => {
  const email = buildFreePublishedEmail({
    ...input,
    siteName: '<img src=x onerror=alert(1)>',
  });

  assert.doesNotMatch(email.html, /<img src=x/);
  assert.match(email.html, /&lt;img src=x onerror=alert\(1\)&gt;/);
});

test('rejects unsafe delivery fields', () => {
  assert.throws(
    () => buildFreePublishedEmail({ ...input, publicUrl: 'http://example.com' }),
    /URL publicada válida/,
  );
  assert.throws(
    () => buildFreePublishedEmail({ ...input, recipientEmail: 'not-an-email' }),
    /correo válido/,
  );
});

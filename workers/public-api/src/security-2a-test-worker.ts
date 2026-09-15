/**
 * Worker local de seguridad. No se referencia desde wrangler.toml de desarrollo
 * ni producción. Monta la ruta real de pagos con un transporte determinista
 * cuya única fuente de fixtures es el D1 temporal del harness.
 */
import { Hono } from 'hono';
import type { Bindings, Variables } from './env';
import { onError } from './middleware/error';
import { payments } from './routes/payments';
import { subscriptions } from './routes/subscriptions';
import { maintenanceSubscriptions } from './routes/maintenance-subscriptions';
import { starterDomains } from './routes/starter-domains';

const app = new Hono<{ Bindings: Bindings; Variables: Variables }>();
app.use('*', async (c, next) => {
  c.set('requestId', crypto.randomUUID());
  c.set('mercadoPagoFetch', async (input, init) => {
    const url = new URL(
      typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url,
    );
    const paymentId = url.pathname.split('/').at(-1) ?? '';
    const headers = new Headers(init?.headers);
    await c.env.DB.prepare(
      'INSERT INTO security_2a_provider_requests (payment_id, authorization, method) VALUES (?, ?, ?)',
    ).bind(paymentId, headers.get('Authorization'), init?.method ?? 'GET').run();
    const fixture = await c.env.DB.prepare(
      'SELECT response_status, response_body FROM security_2a_provider_fixtures WHERE payment_id = ?',
    ).bind(paymentId).first<{ response_status: number; response_body: string }>();
    if (!fixture) return new Response(JSON.stringify({ message: 'not found' }), { status: 404 });
    return new Response(fixture.response_body, {
      status: fixture.response_status,
      headers: { 'Content-Type': 'application/json' },
    });
  });
  await next();
});
app.onError(onError);
app.route('/payments', payments);
app.route('/subscriptions', subscriptions);
app.route('/maintenance-subscriptions', maintenanceSubscriptions);
app.route('/starter-domains', starterDomains);

export default app;

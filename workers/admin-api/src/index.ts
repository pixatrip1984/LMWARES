import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { AppError } from '@starter/domain';
import { parseList } from '@starter/config';
import type { Bindings, Variables } from './env';
import { onError } from './middleware/error';
import { accessMiddleware } from './middleware/auth';
import { publications } from './routes/publications';
import { requests } from './routes/requests';
import { audit } from './routes/audit';

const app = new Hono<{ Bindings: Bindings; Variables: Variables }>();

app.use('*', async (c, next) => {
  c.set('requestId', crypto.randomUUID());
  await next();
});

// CORS: el admin-web necesita enviar cookies (Access) → credentials.
app.use('*', (c, next) => {
  const allowed = parseList(c.env.ALLOWED_ORIGINS);
  return cors({
    origin: (origin) => (allowed.includes(origin) ? origin : null),
    allowMethods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
    allowHeaders: ['Content-Type', 'X-Dev-Email'],
    credentials: true,
  })(c, next);
});

app.onError(onError);
app.notFound((c) =>
  c.json(new AppError('not_found', 'Ruta no encontrada.').toBody(c.get('requestId')), 404),
);

// Salud (sin auth)
app.get('/health', (c) => c.json({ ok: true, service: 'admin-api' }));

// A partir de aquí, todo requiere identidad de Access.
app.use('/admin/*', accessMiddleware());

app.get('/admin/me', (c) => {
  const admin = c.get('admin');
  return c.json({ email: admin.email, name: admin.name, role: admin.role });
});

app.route('/admin/publications', publications);
app.route('/admin/requests', requests);
app.route('/admin/audit', audit);

export default app;

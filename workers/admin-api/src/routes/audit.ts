import { Hono } from 'hono';
import { createRepositories } from '@starter/db';
import type { Bindings, Variables } from '../env';

export const audit = new Hono<{ Bindings: Bindings; Variables: Variables }>();

/** GET /admin/audit — últimos eventos de auditoría. */
audit.get('/', async (c) => {
  const repos = createRepositories(c.env.DB);
  return c.json(await repos.audit.listRecent(100));
});

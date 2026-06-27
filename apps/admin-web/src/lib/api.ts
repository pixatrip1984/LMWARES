import { createAdminClient } from '@starter/api-client';
import { config } from './config';

/** Cliente del Admin API (envía cookie de Cloudflare Access). */
export const api = createAdminClient(config.apiUrl);

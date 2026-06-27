import { createPublicClient } from '@starter/api-client';
import { config } from './config';

/** Cliente único del Public API. React nunca toca D1/R2 directamente. */
export const api = createPublicClient(config.apiUrl);

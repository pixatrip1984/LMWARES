import { createSalesClient } from '@starter/api-client';
import { config } from './config';

export const salesApi = createSalesClient(config.apiUrl);

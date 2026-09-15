import { generateCommercialScope, type CommercialScopeInput } from '@starter/domain';
import type { Bindings } from '../env';

export function draftSalesScope(env: Bindings, input: CommercialScopeInput) {
  return generateCommercialScope(env.DEEPSEEK_API_KEY || env.deepseek_api_key, input);
}

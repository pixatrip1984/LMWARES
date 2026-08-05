import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import ts from 'typescript';

const source = readFileSync(new URL('./package-pricing.ts', import.meta.url), 'utf8')
  .replace(
    "import { AppError } from '../errors';",
    'class AppError extends Error { constructor(code, message) { super(message); this.code = code; } }',
  );
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText;
const {
  UPCOMING_PAID_PACKAGE_MODULES,
  estimateCommercialPackage,
  isPaidPackageModuleAvailable,
  normalizePaidPackageModules,
} = await import(
  `data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`
);

test('prices Starter estimates on the server contract', () => {
  const one = estimateCommercialPackage({
    plan: 'starter',
    modules: ['landing', 'panel', 'catalog'],
    marketing: false,
  });
  const two = estimateCommercialPackage({
    plan: 'starter',
    modules: ['landing', 'panel', 'catalog', 'quote'],
    marketing: false,
  });

  assert.equal(one.implementationAmountCents, 790_000);
  assert.equal(one.estimatedMonthlyAmountCents, 90_000);
  assert.equal(two.implementationAmountCents, 1_090_000);
  assert.equal(two.estimatedMonthlyAmountCents, 90_000);
  assert.throws(() => estimateCommercialPackage({
    plan: 'starter',
    modules: ['landing', 'panel', 'catalog'],
    marketing: true,
  }), /AstraMuses estará disponible próximamente/);
});

test('prices Pro base without trusting a browser amount', () => {
  assert.equal(
    estimateCommercialPackage({
      plan: 'pro',
      modules: ['landing', 'panel', 'catalog'],
      marketing: false,
    }).implementationAmountCents,
    1_490_000,
  );
});

test('keeps Cart and Optimization visible in the catalog but closed for launch', () => {
  assert.deepEqual([...UPCOMING_PAID_PACKAGE_MODULES], ['cart', 'data']);
  assert.equal(isPaidPackageModuleAvailable('catalog'), true);
  assert.equal(isPaidPackageModuleAvailable('cart'), false);
  assert.equal(isPaidPackageModuleAvailable('data'), false);
  assert.throws(() =>
    estimateCommercialPackage({
      plan: 'pro',
      modules: ['landing', 'panel', 'cart', 'data'],
      marketing: false,
    }),
  );
});

test('rejects package combinations outside the paid contract', () => {
  assert.throws(() => normalizePaidPackageModules('starter', ['landing', 'catalog']));
  assert.throws(() =>
    normalizePaidPackageModules('starter', ['landing', 'panel', 'catalog', 'quote', 'docs']),
  );
  assert.throws(() => normalizePaidPackageModules('starter', ['landing', 'panel', 'cart']));
  assert.throws(() => normalizePaidPackageModules('pro', ['landing', 'panel', 'data']));
});

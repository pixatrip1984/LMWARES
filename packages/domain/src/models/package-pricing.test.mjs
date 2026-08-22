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
  splitImplementationIntoPhases,
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

  assert.equal(one.implementationAmountCents, 600_000);
  assert.equal(one.estimatedMonthlyAmountCents, 29_900);
  assert.equal(two.implementationAmountCents, 650_000);
  assert.equal(two.estimatedMonthlyAmountCents, 29_900);
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
      modules: ['landing', 'panel', 'catalog', 'quote', 'blog'],
      marketing: false,
    }).implementationAmountCents,
    700_000,
  );
});

test('prices Pro and Starter share the same base and per-complement increment', () => {
  const starterTwo = estimateCommercialPackage({
    plan: 'starter',
    modules: ['landing', 'panel', 'catalog', 'quote'],
    marketing: false,
  });
  const proThree = estimateCommercialPackage({
    plan: 'pro',
    modules: ['landing', 'panel', 'catalog', 'quote', 'blog'],
    marketing: false,
  });
  // Starter con 2 complementos = 6000 + 500 = 6500.
  // Pro con 3 complementos = 6000 + 500 + 500 = 7000.
  assert.equal(starterTwo.implementationAmountCents, 650_000);
  assert.equal(proThree.implementationAmountCents, 700_000);
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

test('requires at least one complement for Starter and three for Pro', () => {
  assert.throws(
    () => normalizePaidPackageModules('starter', ['landing', 'panel']),
    /al menos un complemento/,
  );
  assert.throws(
    () => normalizePaidPackageModules('pro', ['landing', 'panel', 'catalog', 'quote']),
    /al menos tres complementos/,
  );
  assert.doesNotThrow(() =>
    normalizePaidPackageModules('pro', ['landing', 'panel', 'catalog', 'quote', 'blog']),
  );
});

test('splits the implementation total into 4 equal 25% phases', () => {
  const phases = splitImplementationIntoPhases(790_000);
  assert.equal(phases.length, 4);
  assert.deepEqual(phases.map((phase) => phase.phase), [1, 2, 3, 4]);
  assert.deepEqual(phases.map((phase) => phase.amountCents), [197_500, 197_500, 197_500, 197_500]);
  assert.equal(
    phases.reduce((sum, phase) => sum + phase.amountCents, 0),
    790_000,
  );
});

test('absorbs rounding remainders in the last phase so the total never drifts', () => {
  const phases = splitImplementationIntoPhases(100_001);
  assert.equal(
    phases.reduce((sum, phase) => sum + phase.amountCents, 0),
    100_001,
  );
  assert.equal(phases[0].amountCents, 25_000);
  assert.equal(phases[1].amountCents, 25_000);
  assert.equal(phases[2].amountCents, 25_000);
  assert.equal(phases[3].amountCents, 25_001);
});

test('rejects implementation totals that would create phases below the provider minimum', () => {
  assert.throws(
    () => splitImplementationIntoPhases(3_999),
    /al menos MXN 40/,
  );
  assert.deepEqual(
    splitImplementationIntoPhases(4_000).map((phase) => phase.amountCents),
    [1_000, 1_000, 1_000, 1_000],
  );
  assert.deepEqual(
    splitImplementationIntoPhases(4_002).map((phase) => phase.amountCents),
    [1_000, 1_001, 1_001, 1_000],
  );
});

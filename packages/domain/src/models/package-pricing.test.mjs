import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import ts from 'typescript';

const source = readFileSync(new URL('./package-pricing.ts', import.meta.url), 'utf8')
  .replace("import { AppError } from '../errors';", 'class AppError extends Error {}');
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText;
const { estimateCommercialPackage, normalizePaidPackageModules } = await import(
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
    marketing: true,
  });

  assert.equal(one.implementationAmountCents, 790_000);
  assert.equal(one.estimatedMonthlyAmountCents, 90_000);
  assert.equal(two.implementationAmountCents, 1_090_000);
  assert.equal(two.estimatedMonthlyAmountCents, 100_000);
});

test('prices Pro variants without trusting a browser amount', () => {
  assert.equal(
    estimateCommercialPackage({
      plan: 'pro',
      modules: ['landing', 'panel', 'catalog'],
      marketing: false,
    }).implementationAmountCents,
    1_490_000,
  );
  assert.equal(
    estimateCommercialPackage({
      plan: 'pro',
      modules: ['landing', 'panel', 'cart', 'data'],
      marketing: false,
    }).implementationAmountCents,
    2_490_000,
  );
});

test('rejects package combinations outside the paid contract', () => {
  assert.throws(() => normalizePaidPackageModules('starter', ['landing', 'catalog']));
  assert.throws(() =>
    normalizePaidPackageModules('starter', ['landing', 'panel', 'catalog', 'quote', 'docs']),
  );
  assert.throws(() => normalizePaidPackageModules('starter', ['landing', 'panel', 'cart']));
});

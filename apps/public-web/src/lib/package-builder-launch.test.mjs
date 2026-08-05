import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import ts from 'typescript';

const source = readFileSync(
  new URL('../features/package-builder/packageBuilderModel.ts', import.meta.url),
  'utf8',
).replace(
  /import \{[\s\S]*?\} from '@starter\/domain';/,
  `const COMMERCIAL_PACKAGE_PRICING_CENTS = {
    implementation: {
      starterOneComplement: 790000,
      starterTwoComplements: 1090000,
      proBase: 1490000,
      proWithCartOrOptimization: 1990000,
      proFull: 2490000,
    },
    monthly: {
      maintenanceFrom: 90000,
      operationalMaintenanceFrom: 290000,
      securityAddOnFrom: 190000,
      astramusesStaticFrom: 10000,
    },
  };
  const estimateCommercialPackage = () => ({
    implementationAmountCents: 1490000,
    implementationLabel: 'Pro base',
    maintenanceAmountCents: 90000,
    operationalMaintenanceAmountCents: 290000,
    securityAddOnAmountCents: 190000,
    astramusesAmountCents: 0,
  });
  const isPaidPackageModuleAvailable = (moduleId) => moduleId !== 'cart' && moduleId !== 'data';`,
);

const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText;
const { getPackageLabel, getPlanSeed, togglePackageModule } = await import(
  `data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`
);

test('Pro starts as a sellable base without upcoming integrations', () => {
  assert.deepEqual(getPlanSeed('pro'), ['landing', 'panel', 'catalog']);
  assert.equal(getPackageLabel('pro', getPlanSeed('pro')), 'Pro base · módulos disponibles');
});

test('upcoming integrations cannot be selected in the browser model', () => {
  const current = ['landing', 'panel', 'catalog'];
  for (const moduleId of ['cart', 'data']) {
    const result = togglePackageModule(current, moduleId);
    assert.deepEqual(result.modules, current);
    assert.match(result.message, /disponibles próximamente/);
  }
});

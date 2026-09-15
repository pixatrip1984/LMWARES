import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import ts from 'typescript';

const source = readFileSync(new URL('../features/package-builder/businessInterviewModel.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
const model = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`);

function state(answers) { return { version: 2, answers, skipped: [], currentQuestionId: null, updatedAt: new Date().toISOString() }; }

test('negocio sencillo evita inventario, citas y proyectos irrelevantes', () => {
  const current = state({ business_model: 'services', industry: 'professional', offer_type: ['services'], lead_sources: ['referrals'], sales_start: 'information', sales_channels: ['whatsapp'], website_goals: ['explain', 'contacts'], customer_records: 'no', team_size: 'solo', follow_up: 'no', brand_tone: ['trustworthy'], content_assets: ['none'], contact_name: 'Ana', contact_phone: '55', business_name: 'Estudio Ana' });
  const ids = model.visibleQuestions(current).map((question) => question.id);
  assert.equal(ids.includes('inventory_tracking'), false); assert.equal(ids.includes('appointment_management'), false); assert.equal(ids.includes('project_tracking'), false);
  assert.equal(model.nextQuestion(current), null);
});

test('inventario, citas y proyectos aparecen sólo cuando su flujo los justifica', () => {
  const inventory = state({ business_model: 'products', offer_type: ['products'], website_goals: ['catalog'], sales_start: 'direct_purchase' });
  const appointments = state({ business_model: 'appointments', offer_type: ['appointments'], website_goals: ['bookings'], sales_start: 'appointment' });
  const projects = state({ business_model: 'projects', offer_type: ['projects'], website_goals: ['quotes'], sales_start: 'quote' });
  assert.equal(model.visibleQuestions(inventory).some((q) => q.id === 'inventory_tracking'), true);
  assert.equal(model.visibleQuestions(appointments).some((q) => q.id === 'appointment_management'), true);
  assert.equal(model.visibleQuestions(projects).some((q) => q.id === 'project_tracking'), true);
});

test('editar una respuesta padre limpia la rama condicional que ya no aplica', () => {
  const current = state({ business_model: 'products', offer_type: ['products'], website_goals: ['catalog'], inventory_tracking: 'yes' });
  const withoutCatalog = model.reduceInterviewAnswer(current, 'website_goals', ['explain', 'contacts']);
  const withoutProducts = model.reduceInterviewAnswer(withoutCatalog, 'offer_type', ['services']);
  const edited = model.reduceInterviewAnswer(withoutProducts, 'business_model', 'services');
  assert.equal(Object.hasOwn(edited.answers, 'inventory_tracking'), false);
  assert.equal(model.visibleQuestions(edited).some((question) => question.id === 'inventory_tracking'), false);
});

test('persistencia local recupera una entrevista sin convertirla en evidencia del servidor', () => {
  const values = new Map();
  globalThis.window = { localStorage: { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => values.set(key, value), removeItem: (key) => values.delete(key) } };
  const current = state({ business_model: 'services', business_name: 'Taller de prueba' });
  model.saveInterviewState(current);
  assert.deepEqual(model.loadInterviewState().answers, current.answers);
  model.resetInterviewState();
  assert.equal(values.has('lmwares.business-interview.v2'), false);
  delete globalThis.window;
});

test('perfil conserva evidencia explícita y separa inferencias y capacidades', () => {
  const profile = model.buildBusinessProfile(state({ business_model: 'manufacturing', industry: 'creative_manufacturing', offer_type: ['products', 'projects'], lead_sources: ['social'], sales_start: 'quote', sales_channels: ['whatsapp'], website_goals: ['catalog', 'quotes', 'projects'], inventory_tracking: 'yes', project_tracking: 'yes', customer_records: 'yes', team_size: '2_5', team_access: 'yes', role_permissions: 'yes', follow_up: 'yes', brand_tone: ['artisanal', 'premium'], content_assets: ['logo', 'photos'], contact_name: 'Ana', contact_phone: '55', business_name: 'Taller Norte' }));
  assert.equal(Object.hasOwn(profile.explicitAnswers, 'contact_name'), false);
  assert.equal(profile.entities.includes('inventory'), true); assert.equal(profile.entities.includes('project'), true);
  assert.equal(profile.requirements.suggestedModules.includes('catalog'), true); assert.equal(profile.requirements.suggestedModules.includes('quote'), true);
  assert.equal(profile.inferences.some((item) => item.key === 'entity_inventory'), true);
});

test('servicios, inventario, citas y proyectos producen perfiles útiles para el generador', () => {
  for (const answers of [
    { business_model: 'services', offer_type: ['services'], website_goals: ['explain', 'contacts'] },
    { business_model: 'products', offer_type: ['products'], website_goals: ['catalog'], inventory_tracking: 'yes' },
    { business_model: 'appointments', offer_type: ['appointments'], website_goals: ['bookings'], appointment_management: 'yes' },
    { business_model: 'projects', offer_type: ['projects'], website_goals: ['quotes', 'projects'], project_tracking: 'yes' },
  ]) {
    const profile = model.buildBusinessProfile(state(answers));
    assert.equal(profile.schemaVersion, 'lmwares.business-profile.v1');
    assert.ok(profile.requirements.publicWebsite.length > 0);
  }
});

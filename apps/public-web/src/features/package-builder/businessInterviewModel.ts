import type { BusinessInterviewAnswer, BusinessInterviewInference, BusinessInterviewSubmissionV1, BusinessProfileV1 } from '@starter/domain';
import type { PackageBrief } from './packageBuilderModel';

export type InterviewQuestionKind = 'single' | 'multiple' | 'text';
export type InterviewAnswerMap = Record<string, BusinessInterviewAnswer>;
export type BusinessInterviewState = {
  version: 2;
  answers: InterviewAnswerMap;
  skipped: string[];
  currentQuestionId: string | null;
  updatedAt: string;
};

export type InterviewOption = { value: string; label: string; hint?: string };
export type InterviewQuestion = {
  id: string;
  kind: InterviewQuestionKind;
  title: string;
  description?: string;
  options?: InterviewOption[];
  required?: boolean;
  maxSelections?: number;
  placeholder?: string;
  when?: (answers: InterviewAnswerMap) => boolean;
};

// v2 intentionally starts clean: v1 was seeded from the retired long-form brief.
export const INTERVIEW_STORAGE_KEY = 'lmwares.business-interview.v2';

const yesNo: InterviewOption[] = [{ value: 'yes', label: 'Sí' }, { value: 'no', label: 'No' }];
const has = (answers: InterviewAnswerMap, key: string, values: string[]) => {
  const answer = answers[key]; const list = Array.isArray(answer) ? answer : [answer];
  return list.some((value) => typeof value === 'string' && values.includes(value));
};

export const QUESTION_CATALOG: InterviewQuestion[] = [
  { id: 'contact_name', kind: 'text', title: '¿Con quién coordinaremos esta solicitud?', description: 'Tu nombre o el de la persona responsable.', required: true, placeholder: 'Ej. Ana López' },
  { id: 'contact_phone', kind: 'text', title: '¿Cuál es tu teléfono o WhatsApp?', description: 'Sólo para coordinar la propuesta.', required: true, placeholder: 'Ej. 55 1234 5678' },
  { id: 'business_name', kind: 'text', title: '¿Cómo se llama tu negocio?', description: 'El nombre que te gustaría mostrar públicamente.', required: true, placeholder: 'Ej. Taller Norte' },
  { id: 'business_model', kind: 'single', title: '¿Qué hace principalmente tu negocio?', required: true, options: [
    { value: 'products', label: 'Vende productos', hint: 'Tienda, distribución o catálogo.' }, { value: 'services', label: 'Presta servicios', hint: 'Atención profesional o técnica.' },
    { value: 'manufacturing', label: 'Fabrica productos', hint: 'Taller, producción o piezas.' }, { value: 'rentals', label: 'Renta cosas o espacios' },
    { value: 'projects', label: 'Construye, instala o gestiona proyectos' }, { value: 'appointments', label: 'Atiende citas o reservaciones' },
    { value: 'food', label: 'Sirve alimentos o bebidas' }, { value: 'other', label: 'Otra actividad' },
  ] },
  { id: 'business_model_other', kind: 'text', title: 'Cuéntanos brevemente qué actividad realizan.', required: true, placeholder: 'Ej. Administramos inmuebles para renta', when: (a) => a.business_model === 'other' },
  { id: 'industry', kind: 'single', title: '¿Cuál se parece más a tu giro?', required: true, options: [
    { value: 'retail', label: 'Comercio y distribución' }, { value: 'health_beauty', label: 'Salud, clínica o estética' }, { value: 'professional', label: 'Servicios profesionales' },
    { value: 'construction', label: 'Construcción e instalación' }, { value: 'hospitality', label: 'Alimentos, hospedaje o experiencias' }, { value: 'education_fitness', label: 'Escuela, gimnasio o bienestar' },
    { value: 'creative_manufacturing', label: 'Taller, fabricación o creatividad' }, { value: 'other', label: 'Otro giro' },
  ] },
  { id: 'offer_type', kind: 'multiple', title: '¿Qué ofreces a tus clientes?', description: 'Elige todo lo que aplique.', required: true, maxSelections: 3, options: [
    { value: 'products', label: 'Productos' }, { value: 'services', label: 'Servicios' }, { value: 'projects', label: 'Trabajos por proyecto' },
    { value: 'rentals', label: 'Rentas' }, { value: 'subscriptions', label: 'Suscripciones' }, { value: 'appointments', label: 'Citas o reservaciones' },
  ] },
  { id: 'lead_sources', kind: 'multiple', title: '¿De dónde suelen llegar tus clientes?', description: 'Elige las fuentes más importantes.', required: true, maxSelections: 4, options: [
    { value: 'local', label: 'Local físico' }, { value: 'referrals', label: 'Recomendaciones' }, { value: 'social', label: 'Redes sociales' }, { value: 'whatsapp', label: 'WhatsApp' },
    { value: 'google', label: 'Google' }, { value: 'website', label: 'Sitio actual' }, { value: 'salespeople', label: 'Vendedores' }, { value: 'marketplace', label: 'Marketplace' }, { value: 'advertising', label: 'Publicidad' },
  ] },
  { id: 'sales_start', kind: 'single', title: '¿Cómo suele comenzar una venta?', required: true, options: [
    { value: 'direct_purchase', label: 'Compra directamente' }, { value: 'information', label: 'Primero pide información' }, { value: 'quote', label: 'Primero pide cotización' },
    { value: 'appointment', label: 'Primero agenda una cita' }, { value: 'visit', label: 'Primero solicita una visita' }, { value: 'mixed', label: 'Depende del caso' },
  ] },
  { id: 'sales_channels', kind: 'multiple', title: '¿Dónde ocurre normalmente esa venta?', required: true, maxSelections: 4, options: [
    { value: 'store', label: 'En el local' }, { value: 'whatsapp', label: 'Por WhatsApp' }, { value: 'phone', label: 'Por teléfono' }, { value: 'website', label: 'En la página' }, { value: 'social', label: 'En redes sociales' }, { value: 'onsite', label: 'En domicilio del cliente' },
  ] },
  { id: 'website_goals', kind: 'multiple', title: '¿Qué debería ayudarte a hacer la página?', description: 'Elige las prioridades reales.', required: true, maxSelections: 4, options: [
    { value: 'explain', label: 'Explicar lo que hacemos' }, { value: 'catalog', label: 'Mostrar catálogo' }, { value: 'contacts', label: 'Recibir contactos' }, { value: 'quotes', label: 'Recibir cotizaciones' }, { value: 'bookings', label: 'Permitir citas o reservas' }, { value: 'sell', label: 'Vender' }, { value: 'projects', label: 'Mostrar proyectos' }, { value: 'locations', label: 'Mostrar ubicaciones' }, { value: 'menu', label: 'Mostrar menú' }, { value: 'visits', label: 'Solicitar visitas' },
  ] },
  { id: 'inventory_tracking', kind: 'single', title: '¿Necesitas saber cuántas piezas quedan?', required: true, options: yesNo, when: (a) => has(a, 'offer_type', ['products', 'rentals']) || has(a, 'website_goals', ['catalog', 'sell']) || has(a, 'business_model', ['products', 'manufacturing', 'rentals']) },
  { id: 'appointment_management', kind: 'single', title: '¿Necesitas organizar citas, reservas o disponibilidad?', required: true, options: yesNo, when: (a) => has(a, 'offer_type', ['appointments']) || has(a, 'website_goals', ['bookings']) || has(a, 'business_model', ['appointments']) || a.sales_start === 'appointment' },
  { id: 'project_tracking', kind: 'single', title: '¿Necesitas saber en qué etapa va cada trabajo?', required: true, options: yesNo, when: (a) => has(a, 'offer_type', ['projects']) || has(a, 'website_goals', ['quotes', 'visits']) || has(a, 'business_model', ['projects']) || a.sales_start === 'quote' },
  { id: 'customer_records', kind: 'single', title: '¿Necesitas conservar historial de clientes recurrentes?', required: true, options: yesNo },
  { id: 'team_size', kind: 'single', title: '¿Cuántas personas participan hoy?', required: true, options: [{ value: 'solo', label: 'Sólo yo' }, { value: '2_5', label: '2 a 5 personas' }, { value: '6_20', label: '6 a 20 personas' }, { value: '21_plus', label: 'Más de 20 personas' }] },
  { id: 'team_access', kind: 'single', title: '¿Más de una persona necesitaría entrar al sistema?', required: true, options: yesNo, when: (a) => a.team_size !== 'solo' },
  { id: 'role_permissions', kind: 'single', title: '¿Cada persona debería ver cosas diferentes?', required: true, options: yesNo, when: (a) => a.team_access === 'yes' },
  { id: 'follow_up', kind: 'single', title: '¿Necesitas recordar seguimientos o próximas acciones?', required: true, options: yesNo },
  { id: 'brand_tone', kind: 'multiple', title: '¿Qué debería transmitir tu presencia?', description: 'Elige hasta tres sensaciones.', required: true, maxSelections: 3, options: [{ value: 'premium', label: 'Premium' }, { value: 'technical', label: 'Técnico' }, { value: 'trustworthy', label: 'Confiable' }, { value: 'artisanal', label: 'Artesanal' }, { value: 'modern', label: 'Moderno' }, { value: 'warm', label: 'Cálido' }, { value: 'minimal', label: 'Minimalista' }, { value: 'industrial', label: 'Industrial' }, { value: 'elegant', label: 'Elegante' }, { value: 'energetic', label: 'Energético' }] },
  { id: 'content_assets', kind: 'multiple', title: '¿Con qué material cuentas hoy?', description: 'No tienes que subirlo todavía.', required: true, maxSelections: 6, options: [{ value: 'logo', label: 'Logo' }, { value: 'photos', label: 'Fotos' }, { value: 'texts', label: 'Textos' }, { value: 'catalog', label: 'Catálogo' }, { value: 'prices', label: 'Precios' }, { value: 'social', label: 'Redes sociales' }, { value: 'existing_site', label: 'Página anterior' }, { value: 'none', label: 'Todavía no tengo nada' }] },
  { id: 'existing_site_url', kind: 'text', title: '¿Cuál es la dirección de tu página actual?', description: 'Opcional; sirve sólo como referencia.', placeholder: 'https://...', when: (a) => has(a, 'content_assets', ['existing_site']) },
  { id: 'additional_context', kind: 'text', title: '¿Hay algo importante que debamos saber?', description: 'Opcional. Sólo si no apareció en las preguntas anteriores.', placeholder: 'Ej. Tenemos dos sucursales o una fecha importante.', required: false },
];

export function createInterviewState(): BusinessInterviewState {
  return { version: 2, answers: {}, skipped: [], currentQuestionId: null, updatedAt: new Date().toISOString() };
}

export function loadInterviewState(): BusinessInterviewState {
  if (typeof window === 'undefined') return createInterviewState();
  try {
    const value = JSON.parse(window.localStorage.getItem(INTERVIEW_STORAGE_KEY) || 'null') as Partial<BusinessInterviewState> | null;
    if (value?.version !== 2 || !value.answers || typeof value.answers !== 'object') return createInterviewState();
    return { version: 2, answers: value.answers as InterviewAnswerMap, skipped: Array.isArray(value.skipped) ? value.skipped.filter((x): x is string => typeof x === 'string') : [], currentQuestionId: typeof value.currentQuestionId === 'string' ? value.currentQuestionId : null, updatedAt: typeof value.updatedAt === 'string' ? value.updatedAt : new Date().toISOString() };
  } catch { return createInterviewState(); }
}

export function saveInterviewState(state: BusinessInterviewState) { if (typeof window !== 'undefined') window.localStorage.setItem(INTERVIEW_STORAGE_KEY, JSON.stringify(state)); }
export function resetInterviewState() { if (typeof window !== 'undefined') window.localStorage.removeItem(INTERVIEW_STORAGE_KEY); }
export function visibleQuestions(state: BusinessInterviewState) { return QUESTION_CATALOG.filter((question) => !question.when || question.when(state.answers)); }
export function questionById(id: string | null) { return QUESTION_CATALOG.find((question) => question.id === id) ?? null; }
export function isAnswered(state: BusinessInterviewState, question: InterviewQuestion) { return Object.hasOwn(state.answers, question.id) || state.skipped.includes(question.id); }
export function requiredQuestions(state: BusinessInterviewState) { return visibleQuestions(state).filter((question) => question.required !== false); }
export function nextQuestion(state: BusinessInterviewState) { return visibleQuestions(state).find((question) => question.required !== false && !isAnswered(state, question)) ?? null; }
export function interviewProgress(state: BusinessInterviewState) { const required = requiredQuestions(state); const done = required.filter((question) => isAnswered(state, question)).length; return { done, total: required.length, percent: required.length ? Math.round((done / required.length) * 100) : 0 }; }

/** AnswerReducer: removes answers made unreachable by an edited parent choice. */
export function reduceInterviewAnswer(state: BusinessInterviewState, id: string, answer: BusinessInterviewAnswer): BusinessInterviewState {
  const candidate: BusinessInterviewState = { ...state, answers: { ...state.answers, [id]: answer }, skipped: state.skipped.filter((item) => item !== id), currentQuestionId: id, updatedAt: new Date().toISOString() };
  const allowed = new Set(visibleQuestions(candidate).map((question) => question.id));
  const answers = Object.fromEntries(Object.entries(candidate.answers).filter(([key]) => allowed.has(key)));
  return { ...candidate, answers, skipped: candidate.skipped.filter((key) => allowed.has(key)) };
}

const bool = (answers: InterviewAnswerMap, key: string): boolean | null => answers[key] === 'yes' ? true : answers[key] === 'no' ? false : null;
const array = (answers: InterviewAnswerMap, key: string) => Array.isArray(answers[key]) ? answers[key] as string[] : [];
const value = (answers: InterviewAnswerMap, key: string) => typeof answers[key] === 'string' ? answers[key] as string : '';
const unique = (items: string[]) => [...new Set(items)];

export function buildBusinessProfile(state: BusinessInterviewState): BusinessProfileV1 {
  const a = state.answers; const goals = array(a, 'website_goals'); const model = value(a, 'business_model'); const industry = value(a, 'industry');
  const inferred: BusinessInterviewInference[] = []; const entities = ['customer']; const website = unique(['business_presentation', ...goals]); const internal: string[] = [];
  if (bool(a, 'inventory_tracking')) { entities.push('product', 'inventory'); internal.push('inventory_tracking'); inferred.push({ key: 'entity_inventory', value: true, confidence: 'high', basedOn: ['inventory_tracking'] }); }
  if (bool(a, 'appointment_management')) { entities.push('appointment'); internal.push('appointment_management'); inferred.push({ key: 'entity_appointment', value: true, confidence: 'high', basedOn: ['appointment_management'] }); }
  if (bool(a, 'project_tracking')) { entities.push('project', 'work_item'); internal.push('project_tracking'); inferred.push({ key: 'entity_project', value: true, confidence: 'high', basedOn: ['project_tracking'] }); }
  if (bool(a, 'customer_records')) internal.push('customer_history');
  if (bool(a, 'follow_up')) internal.push('follow_up');
  if (bool(a, 'team_access')) internal.push('team_access');
  if (bool(a, 'role_permissions')) internal.push('role_permissions');
  if (model === 'manufacturing') entities.push('product', 'work_order');
  if (model === 'rentals') entities.push('rental_item', 'reservation');
  const suggestedModules = unique([
    ...((goals.some((x) => ['catalog', 'menu', 'sell'].includes(x))) ? ['catalog'] : []),
    ...((goals.some((x) => ['contacts', 'quotes', 'visits'].includes(x))) ? ['quote'] : []),
    ...((goals.includes('projects') || model === 'manufacturing') ? ['galleries'] : []),
    ...((goals.includes('bookings') || bool(a, 'appointment_management')) ? ['events'] : []),
  ]);
  const unresolved = requiredQuestions(state).filter((question) => !isAnswered(state, question)).map((question) => question.id);
  return {
    schemaVersion: 'lmwares.business-profile.v1',
    explicitAnswers: Object.fromEntries(Object.entries(a).filter(([key]) => !['contact_name', 'contact_phone'].includes(key))),
    inferences: inferred,
    business: { model: model === 'other' ? value(a, 'business_model_other') || 'other' : model, industry, offerTypes: array(a, 'offer_type') },
    salesFlow: { leadSources: array(a, 'lead_sources'), startsWith: value(a, 'sales_start'), channels: array(a, 'sales_channels') },
    operations: { teamSize: value(a, 'team_size'), needsInventory: bool(a, 'inventory_tracking'), needsAppointments: bool(a, 'appointment_management'), needsProjectTracking: bool(a, 'project_tracking'), needsCustomerRecords: bool(a, 'customer_records'), needsFollowUp: bool(a, 'follow_up'), needsTeamAccess: bool(a, 'team_access'), needsRolePermissions: bool(a, 'role_permissions') },
    entities: unique(entities), requirements: { publicWebsite: website, internalSystem: unique(internal), suggestedModules }, contentAssets: array(a, 'content_assets'), visualPreferences: array(a, 'brand_tone'), confidence: { completeness: requiredQuestions(state).length ? Number(((requiredQuestions(state).length - unresolved.length) / requiredQuestions(state).length).toFixed(2)) : 0, unresolved },
  };
}

const labels = (items: string[]) => items.map((item) => QUESTION_CATALOG.flatMap((q) => q.options || []).find((option) => option.value === item)?.label || item);
export function deriveBrief(state: BusinessInterviewState, previous: PackageBrief): PackageBrief {
  const profile = buildBusinessProfile(state); const a = state.answers;
  const businessSummary = [
    `Negocio de ${profile.business.model || 'actividad comercial'}${profile.business.industry ? ` en ${profile.business.industry}` : ''}.`,
    profile.business.offerTypes.length ? `Ofrece: ${labels(profile.business.offerTypes).join(', ')}.` : '',
    profile.salesFlow.startsWith ? `Las ventas suelen iniciar con: ${labels([profile.salesFlow.startsWith]).join('')}.` : '',
    value(a, 'additional_context'),
  ].filter(Boolean).join(' ');
  const siteGoal = profile.requirements.publicWebsite.length ? `La página debe ayudar a: ${labels(profile.requirements.publicWebsite.filter((x) => x !== 'business_presentation')).join(', ') || 'presentar el negocio'}.` : previous.siteGoal;
  return { ...previous, contactName: value(a, 'contact_name') || previous.contactName, contactPhone: value(a, 'contact_phone') || previous.contactPhone, businessName: value(a, 'business_name') || previous.businessName, businessSummary: businessSummary || previous.businessSummary, siteGoal, stylePreference: labels(profile.visualPreferences).join(', ') || previous.stylePreference, referenceNotes: value(a, 'existing_site_url') || previous.referenceNotes };
}

export function buildInterviewSubmission(state: BusinessInterviewState): BusinessInterviewSubmissionV1 { return { schemaVersion: 'lmwares.business-interview-submission.v1', profile: buildBusinessProfile(state), completedAt: new Date().toISOString() }; }

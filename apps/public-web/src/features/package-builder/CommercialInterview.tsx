import { useEffect, useMemo, useState } from 'react';
import type { BusinessInterviewAnswer } from '@starter/domain';
import {
  buildBusinessProfile,
  interviewProgress,
  isAnswered,
  nextQuestion,
  questionById,
  reduceInterviewAnswer,
  requiredQuestions,
  saveInterviewState,
  type BusinessInterviewState,
  type InterviewOption,
  type InterviewQuestion,
  visibleQuestions,
} from './businessInterviewModel';
import './commercialInterview.css';

type Props = {
  state: BusinessInterviewState;
  onChange: (state: BusinessInterviewState) => void;
  onReadyChange: (ready: boolean) => void;
};

type StageId = 'contact' | 'business' | 'activity' | 'review';
type InterviewStage = { id: StageId; label: string; heading: string; description: string };

const STAGES: InterviewStage[] = [
  { id: 'contact', label: 'Contacto', heading: 'Empecemos por lo esencial.', description: 'Usaremos estos datos sólo para coordinar tu propuesta.' },
  { id: 'business', label: 'Negocio', heading: 'Cuéntanos sobre tu negocio.', description: 'Respuestas cortas. Sólo preguntamos lo necesario según lo que elijas.' },
  { id: 'activity', label: 'Actividad', heading: 'Veamos cómo trabaja tu operación.', description: 'Esto nos permite proponer una presencia útil, no una página genérica.' },
  { id: 'review', label: 'Revisión', heading: 'Revisemos lo que entendimos.', description: 'Puedes corregir cualquier respuesta antes de enviar tu solicitud.' },
];

const CONTACT_IDS = new Set(['contact_name', 'contact_phone']);
const BUSINESS_IDS = new Set(['business_name', 'business_model', 'business_model_other', 'industry', 'offer_type']);
const stageForQuestion = (id: string | null): StageId => id && CONTACT_IDS.has(id) ? 'contact' : id && BUSINESS_IDS.has(id) ? 'business' : 'activity';
const iconFor = (value: string) => {
  if (/product|catalog|sell|menu/.test(value)) return '◫';
  if (/service|quote|visit/.test(value)) return '✦';
  if (/appointment|booking|reservation/.test(value)) return '◷';
  if (/project|construction|manufacturing/.test(value)) return '◇';
  if (/rental|location|store/.test(value)) return '⌂';
  if (/food|hospitality/.test(value)) return '◉';
  return '•';
};

export function CommercialInterview({ state, onChange, onReadyChange }: Props) {
  const questions = useMemo(() => visibleQuestions(state), [state]);
  const required = useMemo(() => requiredQuestions(state), [state]);
  const firstPending = nextQuestion(state);
  const [activeId, setActiveId] = useState<string | null>(() => state.currentQuestionId || firstPending?.id || questions[0]?.id || null);
  const [editing, setEditing] = useState(false);
  const active = questionById(activeId) || firstPending || questions[0] || null;
  const progress = interviewProgress(state);
  const ready = !firstPending;
  const activeStageId: StageId = ready && !editing ? 'review' : stageForQuestion(active?.id || firstPending?.id || null);
  const activeStageIndex = STAGES.findIndex((stage) => stage.id === activeStageId);
  const questionsInStage = questions.filter((question) => stageForQuestion(question.id) === activeStageId);
  const stageQuestionIndex = active ? Math.max(1, questionsInStage.findIndex((question) => question.id === active.id) + 1) : 0;

  useEffect(() => { saveInterviewState(state); onReadyChange(ready); }, [state, ready, onReadyChange]);
  useEffect(() => {
    if (!active || !questions.some((question) => question.id === active.id)) setActiveId(firstPending?.id || questions[0]?.id || null);
  }, [active, firstPending, questions]);

  const commit = (id: string, value: BusinessInterviewAnswer) => {
    const next = reduceInterviewAnswer(state, id, value);
    onChange(next);
    const following = nextQuestion(next);
    if (following && following.id !== id) setActiveId(following.id);
    if (!following) setEditing(false);
  };
  const select = (id: string, value: BusinessInterviewAnswer) => onChange(reduceInterviewAnswer(state, id, value));
  const skip = () => {
    if (!active || active.required !== false) return;
    const next = { ...state, skipped: [...new Set([...state.skipped, active.id])], currentQuestionId: active.id, updatedAt: new Date().toISOString() };
    onChange(next); setActiveId(nextQuestion(next)?.id || null);
  };
  const back = () => {
    const index = questions.findIndex((question) => question.id === active?.id);
    setActiveId(questions[Math.max(0, index - 1)]?.id || null);
  };
  return (
    <section className="lmw-interview" aria-labelledby="commercial-interview-title">
      <StageStepper activeIndex={activeStageIndex} />
      <div className="lmw-interview__shell">
        <header className="lmw-interview__header">
          <p className="lmw-interview__eyebrow">Paso {activeStageIndex + 1} de {STAGES.length}{activeStageId !== 'review' && questionsInStage.length ? <span> · Pregunta {stageQuestionIndex} de {questionsInStage.length}</span> : null}</p>
          <h2 id="commercial-interview-title">{STAGES[activeStageIndex]?.heading}</h2>
          <p>{STAGES[activeStageIndex]?.description}</p>
          <div className="lmw-interview__progress" aria-label={`${progress.done} de ${progress.total} decisiones principales listas`}><i><b style={{ width: `${progress.percent}%` }} /></i><span>{progress.percent}% completado</span></div>
        </header>
        {(!ready || editing) && active ? <QuestionCard key={active.id} question={active} answer={state.answers[active.id]} onBack={back} onContinue={(answer) => commit(active.id, answer)} onSelect={(answer) => select(active.id, answer)} onSkip={skip} canBack={questions.findIndex((question) => question.id === active.id) > 0} /> : null}
        {ready && !editing ? <InterviewReview state={state} questions={questions} onEdit={(id) => { setActiveId(id); setEditing(true); }} /> : null}
      </div>
    </section>
  );
}

function StageStepper({ activeIndex }: { activeIndex: number }) {
  return <ol className="lmw-interview__stepper" aria-label="Progreso de la solicitud">
    {STAGES.map((stage, index) => <li className={index < activeIndex ? 'is-complete' : index === activeIndex ? 'is-active' : ''} key={stage.id}><span aria-hidden="true">{index < activeIndex ? '✓' : index + 1}</span><b>{stage.label}</b></li>)}
  </ol>;
}

function QuestionCard({ question, answer, onSelect, onContinue, onBack, canBack, onSkip }: { question: InterviewQuestion; answer: BusinessInterviewAnswer | undefined; onSelect: (answer: BusinessInterviewAnswer) => void; onContinue: (answer: BusinessInterviewAnswer) => void; onBack: () => void; canBack: boolean; onSkip: () => void }) {
  const [text, setText] = useState(typeof answer === 'string' ? answer : '');
  useEffect(() => setText(typeof answer === 'string' ? answer : ''), [answer, question.id]);
  const chosen = Array.isArray(answer) ? answer : [];
  const canContinue = question.kind === 'text' ? Boolean(text.trim()) || question.required === false : question.kind === 'multiple' ? chosen.length > 0 : typeof answer === 'string';
  const continueWithAnswer = () => {
    if (question.kind === 'text') { if (text.trim()) onContinue(text.trim()); else onSkip(); return; }
    if (question.kind === 'multiple') onContinue(chosen);
    else if (typeof answer === 'string') onContinue(answer);
  };
  return <article className="lmw-interview__card">
    <div className="lmw-interview__question"><span aria-hidden="true" className="lmw-interview__question-icon">✦</span><div><p>{question.kind === 'multiple' ? 'Puedes elegir varias respuestas' : question.required === false ? 'Pregunta opcional' : 'Elige una respuesta'}</p><h3>{question.title}</h3>{question.description ? <small>{question.description}</small> : null}</div></div>
    {question.kind === 'text' ? <label className="lmw-interview__text"><span className="sr-only">{question.title}</span><input autoFocus onChange={(event) => setText(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter' && canContinue) { event.preventDefault(); continueWithAnswer(); } }} placeholder={question.placeholder} type={question.id === 'contact_phone' ? 'tel' : 'text'} value={text} /></label> : null}
    {question.kind === 'single' ? <div className="lmw-interview__options">{question.options?.map((option) => <OptionCard answer={answer} key={option.value} option={option} onSelect={() => onSelect(option.value)} />)}</div> : null}
    {question.kind === 'multiple' ? <div className="lmw-interview__options">{question.options?.map((option) => <OptionCard answer={chosen} key={option.value} option={option} onSelect={() => { const next = chosen.includes(option.value) ? chosen.filter((item) => item !== option.value) : [...chosen, option.value]; if (!question.maxSelections || next.length <= question.maxSelections) onSelect(next); }} />)}</div> : null}
    <footer className="lmw-interview__actions"><button className="lmw-interview__back" disabled={!canBack} onClick={onBack} type="button">← Volver</button><div>{question.required === false ? <button className="lmw-interview__skip" onClick={onSkip} type="button">Omitir</button> : null}<button className="lmw-interview__continue" disabled={!canContinue} onClick={continueWithAnswer} type="button">Continuar <span>→</span></button></div></footer>
  </article>;
}

function OptionCard({ option, answer, onSelect }: { option: InterviewOption; answer: BusinessInterviewAnswer | string[] | undefined; onSelect: () => void }) {
  const selected = Array.isArray(answer) ? answer.includes(option.value) : answer === option.value;
  return <button aria-pressed={selected} className={selected ? 'is-selected' : ''} onClick={onSelect} type="button"><span aria-hidden="true" className="lmw-interview__option-icon">{iconFor(option.value)}</span><span className="lmw-interview__option-copy"><b>{option.label}</b>{option.hint ? <small>{option.hint}</small> : null}</span><span aria-hidden="true" className="lmw-interview__check">{selected ? '✓' : ''}</span></button>;
}

function InterviewReview({ state, questions, onEdit }: { state: BusinessInterviewState; questions: InterviewQuestion[]; onEdit: (id: string) => void }) {
  const profile = buildBusinessProfile(state);
  return <article className="lmw-interview__review"><div className="lmw-interview__review-intro"><p className="lmw-interview__eyebrow">Diagnóstico completo</p><h3>Así entendimos tu negocio.</h3><p>Las conclusiones se distinguen de tus respuestas. Corrige cualquier dato antes de enviar tu solicitud.</p></div><div className="lmw-interview__insights"><article><span>Negocio</span><strong>{profile.business.model || 'Sin clasificar'}</strong></article><article><span>Prioridades web</span><strong>{profile.requirements.publicWebsite.filter((item) => item !== 'business_presentation').join(', ') || 'Presentación'}</strong></article><article><span>Capacidades sugeridas</span><strong>{profile.requirements.suggestedModules.join(', ') || 'Sitio base'}</strong></article></div><ul>{questions.filter((question) => isAnswered(state, question)).map((question) => <li key={question.id}><span>{question.title}</span><button onClick={() => onEdit(question.id)} type="button">Editar</button></li>)}</ul></article>;
}

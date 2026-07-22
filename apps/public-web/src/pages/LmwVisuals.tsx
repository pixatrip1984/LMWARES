import type { FaqGroup } from './lmwaresContent';

const introAssets: Record<string, string> = {
  tesis: '/assets/lmwares/intro/tesis.png',
  modelo: '/assets/lmwares/intro/modelo.png',
  operacion: '/assets/lmwares/intro/operacion.png',
  capacidad: '/assets/lmwares/intro/capacidad.png',
  planes: '/assets/lmwares/intro/planes.png',
  objeciones: '/assets/lmwares/intro/objeciones.png',
};

const planAssets = {
  basic: '/assets/lmwares/planes/basic-devops-tools-v2.jpg?v=20260722d',
  advanced: '/assets/lmwares/planes/advanced-security-tools-v2.jpg?v=20260722d',
  astra: '/assets/lmwares/planes/astra-multichannel-visual-v2.jpg?v=20260722c',
} as const;

export function VisualMedia({ src, alt }: { src: string; alt: string }) {
  return (
    <div className="lmw-media">
      <img alt={alt} decoding="async" draggable={false} loading="eager" src={src} />
    </div>
  );
}

export function IntroArtwork({ kind }: { kind: string }) {
  const faqId = kind.startsWith('faq-') ? kind.slice(4) : null;
  const src = faqId
    ? `/assets/lmwares/faq/${faqId}-answer.png`
    : (introAssets[kind] ?? introAssets.objeciones);

  return (
    <div className="lmw-intro-art" aria-hidden="true">
      <img alt="" decoding="async" draggable={false} loading="eager" src={src} />
    </div>
  );
}

export function PlanPreview({ kind }: { kind: keyof typeof planAssets }) {
  return (
    <img
      alt=""
      className="lmw-plan-card__image"
      decoding="async"
      draggable={false}
      loading="eager"
      src={planAssets[kind]}
    />
  );
}

export function FaqQuestionArtwork({
  groupId,
  questionIndex,
}: {
  groupId: FaqGroup['id'];
  questionIndex: number;
}) {
  return (
    <img
      alt=""
      className="lmw-faq-question-image"
      decoding="async"
      draggable={false}
      loading="eager"
      src={`/assets/lmwares/faq/${groupId}-q${questionIndex + 1}-thumb-v3.jpg?v=20260722b`}
    />
  );
}

export function FaqGraphic({ group, questionIndex }: { group: FaqGroup; questionIndex: number }) {
  return (
    <div
      className={`lmw-faq-graphic lmw-faq-graphic--${group.id}`}
      data-question={questionIndex}
      aria-hidden="true"
    >
      <img
        alt=""
        decoding="async"
        draggable={false}
        loading="eager"
        src={`/assets/lmwares/faq/${group.id}-q${questionIndex + 1}-answer-v3.jpg?v=20260722b`}
      />
    </div>
  );
}

export type TabId = 'tesis' | 'modelo' | 'operacion' | 'capacidad' | 'planes' | 'objeciones';

export type TabDefinition = {
  id: TabId;
  number: string;
  label: string;
  channel: 0 | 1;
};

export const TABS: TabDefinition[] = [
  { id: 'tesis', number: '01', label: 'Tesis', channel: 0 },
  { id: 'modelo', number: '02', label: 'Modelo', channel: 0 },
  { id: 'operacion', number: '03', label: 'Operación', channel: 0 },
  { id: 'capacidad', number: '04', label: 'Capacidad', channel: 1 },
  { id: 'planes', number: '05', label: 'Planes', channel: 1 },
  { id: 'objeciones', number: '06', label: 'Objeciones', channel: 1 },
];

export type VisualKind =
  | 'diagnostico'
  | 'sistema'
  | 'publicacion'
  | 'evolucion'
  | 'marca'
  | 'datos'
  | 'dominio'
  | 'contenido'
  | 'codigo'
  | 'componentes'
  | 'arquitectura'
  | 'herramientas'
  | 'landing'
  | 'blog'
  | 'galeria'
  | 'catalogo'
  | 'carrito'
  | 'cotizador'
  | 'panel'
  | 'eventos'
  | 'docs';

export const THESIS_STEPS = [
  {
    number: '01',
    title: 'Diagnóstico',
    text: 'Una necesidad concreta',
    visual: 'diagnostico',
    asset: '/assets/lmwares/tesis/diagnostico-visual.webp?v=20260721b',
  },
  {
    number: '02',
    title: 'Sistema',
    text: 'La herramienta exacta',
    visual: 'sistema',
    asset: '/assets/lmwares/tesis/sistema-visual.webp?v=20260721b',
  },
  {
    number: '03',
    title: 'Publicación',
    text: 'Operación en la web',
    visual: 'publicacion',
    asset: '/assets/lmwares/tesis/publicacion-visual.webp?v=20260721b',
  },
  {
    number: '04',
    title: 'Evolución',
    text: 'Crece cuando aporta valor',
    visual: 'evolucion',
    asset: '/assets/lmwares/tesis/evolucion-visual.webp?v=20260721b',
  },
] as const;

export const OWNERSHIP_ASSETS = [
  {
    title: 'Marca',
    visual: 'marca',
    asset: '/assets/lmwares/modelo/marca-visual.webp?v=20260721',
  },
  {
    title: 'Datos',
    visual: 'datos',
    asset: '/assets/lmwares/modelo/datos-visual.webp?v=20260721',
  },
  {
    title: 'Dominio',
    visual: 'dominio',
    asset: '/assets/lmwares/modelo/dominio-visual.webp?v=20260721',
  },
  {
    title: 'Contenido',
    visual: 'contenido',
    asset: '/assets/lmwares/modelo/contenido-visual.webp?v=20260721',
  },
] as const;

export const LMWARES_ASSETS = [
  {
    title: 'Código',
    visual: 'codigo',
    asset: '/assets/lmwares/modelo/codigo-visual.webp?v=20260721',
  },
  {
    title: 'Componentes',
    visual: 'componentes',
    asset: '/assets/lmwares/modelo/componentes-visual.webp?v=20260721',
  },
  {
    title: 'Arquitectura',
    visual: 'arquitectura',
    asset: '/assets/lmwares/modelo/arquitectura-visual.webp?v=20260721',
  },
  {
    title: 'Herramientas',
    visual: 'herramientas',
    asset: '/assets/lmwares/modelo/herramientas-visual.webp?v=20260721',
  },
] as const;

export const SOLUTION_MODULES = [
  {
    title: 'Sitio web',
    subtitle: 'Captación',
    visual: 'landing',
    asset: '/assets/lmwares/operacion/landing-visual.webp?v=20260721',
  },
  {
    title: 'Blog',
    subtitle: 'Contenido',
    visual: 'blog',
    asset: '/assets/lmwares/operacion/blog-visual.webp?v=20260721',
  },
  {
    title: 'Galerías',
    subtitle: 'Muestra',
    visual: 'galeria',
    asset: '/assets/lmwares/operacion/galerias-visual.webp?v=20260721',
  },
  {
    title: 'Catálogo',
    subtitle: 'Orden',
    visual: 'catalogo',
    asset: '/assets/lmwares/operacion/catalogo-visual.webp?v=20260721',
  },
  {
    title: 'E-Commerce',
    subtitle: 'Próximamente',
    visual: 'carrito',
    asset: '/assets/lmwares/operacion/carrito-visual.webp?v=20260721',
    availability: 'coming-soon',
  },
  {
    title: 'Cotizador',
    subtitle: 'Ventas',
    visual: 'cotizador',
    asset: '/assets/lmwares/operacion/cotizador-visual.webp?v=20260721',
  },
  {
    title: 'Panel',
    subtitle: 'Control',
    visual: 'panel',
    asset: '/assets/lmwares/operacion/panel-visual.webp?v=20260721',
  },
  {
    title: 'AI Optimization',
    subtitle: 'Próximamente',
    visual: 'datos',
    asset: '/assets/lmwares/operacion/datos-visual.webp?v=20260721',
    availability: 'coming-soon',
  },
  {
    title: 'Eventos',
    subtitle: 'Automatización',
    visual: 'eventos',
    asset: '/assets/lmwares/operacion/eventos-visual.webp?v=20260721',
  },
  {
    title: 'Docs',
    subtitle: 'Conocimiento',
    visual: 'docs',
    asset: '/assets/lmwares/operacion/docs-visual.webp?v=20260721',
  },
] as const;

export const SCALE_LEVELS = [
  {
    number: '01',
    title: 'Base',
    description: 'Sitio web o catálogo inicial',
    signal: 'Tráfico moderado',
    pattern: 'dots',
    asset: '/assets/lmwares/capacidad/base-visual.webp?v=20260721d',
  },
  {
    number: '02',
    title: 'Activo',
    description: 'Más contenido y archivos',
    signal: 'Mayor frecuencia',
    pattern: 'streams',
    asset: '/assets/lmwares/capacidad/activo-visual.webp?v=20260721d',
  },
  {
    number: '03',
    title: 'Operativo',
    description: 'Usuarios y automatización',
    signal: 'Uso cotidiano',
    pattern: 'circuits',
    asset: '/assets/lmwares/capacidad/operativo-visual.webp?v=20260721d',
  },
  {
    number: '04',
    title: 'Ampliado',
    description: 'Más datos e integraciones',
    signal: 'Capacidad dedicada',
    pattern: 'dense',
    asset: '/assets/lmwares/capacidad/ampliado-visual.webp?v=20260721d',
  },
] as const;

export type FaqAnswer = {
  question: string;
  answer: string;
  badges: readonly [string, string];
  note: string;
};

export type FaqGroup = {
  id: 'licencia' | 'activos' | 'publicacion' | 'mantenimiento' | 'crecimiento';
  label: string;
  eyebrow: string;
  headline: string;
  lead: string;
  footer: string;
  questions: readonly FaqAnswer[];
};

export const FAQ_GROUPS: readonly FaqGroup[] = [
  {
    id: 'licencia',
    label: 'Pago y licencia',
    eyebrow: 'Objeciones y respuestas',
    headline: 'Pregunta sin rodeos. Respuesta sin letra pequeña.',
    lead: 'Explora una duda. El panel cambia sin abrir ventanas ni perder el contexto.',
    footer: 'Condiciones claras antes de comenzar.',
    questions: [
      {
        question: '¿Pago una vez y el sistema queda para siempre?',
        answer:
          'El pago inicial cubre la implementación y una licencia de uso indefinida para el negocio contratado. La versión entregada puede permanecer publicada dentro de la capacidad incluida.',
        badges: ['Implementación + licencia', 'Sin renovación obligatoria'],
        note: 'Los cambios y la capacidad adicional se contratan sólo cuando hacen falta.',
      },
      {
        question: '¿Tengo que pagar mantenimiento para conservar la licencia?',
        answer:
          'No. El mantenimiento no renueva ni mantiene activa la licencia. Es un servicio opcional para realizar ajustes, actualizar contenido y contar con soporte básico.',
        badges: ['Licencia independiente', 'Acompañamiento opcional'],
        note: 'Puedes solicitar mantenimiento mensual o un cambio puntual cuando lo necesites.',
      },
      {
        question: '¿Qué significa que la licencia sea indefinida?',
        answer:
          'Significa que no tiene una fecha periódica de vencimiento mientras el sistema siga utilizándose para el negocio identificado en la propuesta.',
        badges: ['Sin vencimiento periódico', 'Para el negocio contratado'],
        note: 'No equivale a revender, sublicenciar ni transferir la base tecnológica.',
      },
      {
        question: '¿Puedo usar la misma implementación en otro negocio?',
        answer:
          'La licencia estándar corresponde al negocio contratado. Sucursales, franquicias, marcas adicionales u otra operación se definen expresamente en la propuesta.',
        badges: ['Alcance identificado', 'Ampliación cotizable'],
        note: 'Así cada operación queda documentada con claridad desde el inicio.',
      },
    ],
  },
  {
    id: 'activos',
    label: 'Activos y código',
    eyebrow: 'Activos y código',
    headline: 'Tu negocio es tuyo. La tecnología se licencia.',
    lead: 'Separamos los activos de tu operación de la base técnica que hace funcionar el sistema.',
    footer: 'Marca · contenido · datos · dominio',
    questions: [
      {
        question: '¿El código fuente es mío?',
        answer:
          'Tu marca, contenido, datos y dominio son tuyos. La licencia estándar permite utilizar el sistema, pero no transfiere el código fuente ni la base tecnológica de LMWares.',
        badges: ['Tus activos bajo tu control', 'Tecnología LMWares licenciada'],
        note: 'La entrega del código o una cesión exclusiva pueden cotizarse por separado.',
      },
      {
        question: '¿Qué activos siguen siendo míos?',
        answer:
          'Conservas la propiedad y el control de tu marca, dominio, fotografías, textos, archivos, información comercial y datos generados por tu operación.',
        badges: ['Identidad comercial propia', 'Datos de tu operación'],
        note: 'La tecnología base puede reutilizarse; tus activos particulares no.',
      },
      {
        question: '¿Por qué la licencia no es exclusiva?',
        answer:
          'Porque LMWares reutiliza arquitectura, métodos y componentes generales para construir con eficiencia. Eso no autoriza a reutilizar tu marca, datos, contenido ni información confidencial.',
        badges: ['Base tecnológica reutilizable', 'Activos particulares protegidos'],
        note: 'La exclusividad de un diseño o implementación puede acordarse expresamente.',
      },
      {
        question: '¿Puedo recibir el código o contratar exclusividad?',
        answer:
          'Sí puede evaluarse. La entrega del repositorio, una licencia ampliada o una cesión exclusiva requieren definir alcance, dependencias, documentación y precio específico.',
        badges: ['Opción evaluable', 'Alcance documentado'],
        note: 'La licencia estándar no limita la posibilidad de negociar una entrega distinta.',
      },
    ],
  },
  {
    id: 'publicacion',
    label: 'Dominio y publicación',
    eyebrow: 'Dominio y publicación',
    headline: 'Primero lo pruebas. Después vive en tu dominio.',
    lead: 'Usamos un entorno temporal durante el desarrollo. La versión aprobada se publica en el dominio de tu negocio.',
    footer: 'Desarrollo temporal · Publicación controlada',
    questions: [
      {
        question: '¿El sistema funcionará en mi propio dominio?',
        answer:
          'Durante el desarrollo utilizamos un subdominio temporal de LMWares para revisar y aprobar la implementación. Al iniciar la operación y formalizar el mantenimiento acordado, publicamos la versión aprobada en tu propio dominio.',
        badges: ['Subdominio temporal para desarrollo', 'Tu dominio para operación'],
        note: 'Tu dominio y sus credenciales permanecen bajo tu control.',
      },
      {
        question: '¿Para qué sirve el subdominio de LMWares?',
        answer:
          'Es un entorno temporal de construcción y revisión. Permite validar textos, imágenes, flujos y comportamiento antes de activar la operación formal.',
        badges: ['Revisión sin riesgo', 'Entorno temporal'],
        note: 'No se presenta como el domicilio digital definitivo del negocio.',
      },
      {
        question: '¿Cuándo se realiza la publicación final?',
        answer:
          'Cuando el alcance acordado está aprobado y comienza la etapa operativa. Coordinamos configuración, verificación y publicación para evitar un cambio improvisado.',
        badges: ['Entrega aprobada', 'Activación coordinada'],
        note: 'La fecha y los requisitos se documentan antes de conectar el dominio.',
      },
      {
        question: '¿Mi dominio sigue bajo mi control?',
        answer:
          'Sí. El dominio es un activo del negocio. LMWares configura lo necesario para publicar el sistema sin apropiarse de su registro ni de sus credenciales.',
        badges: ['Registro del cliente', 'Configuración acompañada'],
        note: 'También se acuerda cómo actuar ante una futura migración o cambio de proveedor.',
      },
    ],
  },
  {
    id: 'mantenimiento',
    label: 'Cambios y cuidado',
    eyebrow: 'Cambios y cuidado',
    headline: 'Tu sistema sigue. El cuidado se activa cuando lo necesitas.',
    lead: 'La versión entregada puede permanecer publicada. Si cambia tu operación, eliges acompañamiento mensual o una actualización puntual.',
    footer: 'Mantenimiento opcional · Cambios puntuales',
    questions: [
      {
        question: '¿Qué sucede si no contrato mantenimiento?',
        answer:
          'El sistema puede permanecer publicado en el estado de entrega, dentro de la capacidad incluida. Cuando necesites modificar contenido o realizar ajustes, puedes elegir mantenimiento mensual o solicitar una actualización puntual.',
        badges: ['Versión entregada en operación', 'Cambios cuando los necesitas'],
        note: 'El mantenimiento es acompañamiento, no una renta por usar el sistema.',
      },
      {
        question: '¿Qué incluye el mantenimiento mensual?',
        answer:
          'Incluye ajustes menores, actualizaciones de contenido y soporte básico dentro de una capacidad mensual definida con claridad en la propuesta.',
        badges: ['Ajustes cotidianos', 'Capacidad mensual clara'],
        note: 'Cada plan indicará solicitudes, horas o volumen de contenido disponible.',
      },
      {
        question: '¿Qué se considera un ajuste menor?',
        answer:
          'Cambios dentro de la estructura existente: textos, imágenes, datos de contacto, horarios, precios, configuraciones simples y pequeñas adecuaciones visuales.',
        badges: ['Misma estructura', 'Trabajo acotado'],
        note: 'El criterio objetivo y los límites se fijarán en cada propuesta.',
      },
      {
        question: '¿Las nuevas funciones están incluidas?',
        answer:
          'Las nuevas capacidades, integraciones, secciones importantes, automatizaciones y cambios estructurales se dimensionan como proyecto o trabajo por evento.',
        badges: ['Cuidado cotidiano', 'Nuevas capacidades aparte'],
        note: 'Así el mantenimiento sigue siendo predecible para ambas partes.',
      },
    ],
  },
  {
    id: 'crecimiento',
    label: 'Crecimiento y terceros',
    eyebrow: 'Crecimiento y terceros',
    headline: 'Empieza con lo necesario. Escala con señales reales.',
    lead: 'La capacidad crece con el tráfico, los archivos y la operación. Los cambios externos se revisan por impacto.',
    footer: 'Aviso previo · Capacidad proporcional',
    questions: [
      {
        question: '¿Qué pasa si mi proyecto crece?',
        answer:
          'Tu implementación comienza con capacidad adecuada para un uso moderado. Si aumentan las visitas, el catálogo, el almacenamiento o la actividad, te avisamos y proponemos una ampliación acorde con el nuevo consumo.',
        badges: ['Capacidad inicial incluida', 'Escalamiento con aviso previo'],
        note: 'Los cambios de terceros se revisan según su impacto antes de realizar ajustes.',
      },
      {
        question: '¿El alojamiento básico tiene límites?',
        answer:
          'Sí. El nivel básico contempla un consumo moderado medido por tráfico, almacenamiento, transferencia, operaciones y otros recursos definidos en la propuesta.',
        badges: ['Variables medibles', 'Nivel inicial adecuado'],
        note: 'Los límites objetivos se informarán antes de contratar.',
      },
      {
        question: '¿Qué ocurre si cambia un servicio externo?',
        answer:
          'LMWares revisa el impacto técnico y propone el ajuste necesario. El diagnóstico inicial puede formar parte del mantenimiento; la adaptación se dimensiona según el cambio real.',
        badges: ['Revisión de impacto', 'Ajuste dimensionado'],
        note: 'Una modificación externa no se convierte automáticamente en trabajo ilimitado.',
      },
      {
        question: '¿Me avisarán antes de ampliar la capacidad?',
        answer:
          'Sí. Cuando las mediciones indiquen que el nivel actual deja de ser suficiente, recibirás una propuesta de ampliación antes de realizar el cambio.',
        badges: ['Sin cambios sorpresa', 'Propuesta previa'],
        note: 'La capacidad aumenta de forma proporcional al uso real del proyecto.',
      },
    ],
  },
] as const;

const INTRO_ASSETS = TABS.map((tab) => `/assets/lmwares/intro/${tab.id}.webp`);
const FAQ_VISUAL_ASSETS = FAQ_GROUPS.flatMap((group) => [
  ...group.questions.map(
    (_, questionIndex) =>
      `/assets/lmwares/faq/${group.id}-q${questionIndex + 1}-thumb-v3.jpg?v=20260722b`,
  ),
  ...group.questions.map(
    (_, questionIndex) =>
      `/assets/lmwares/faq/${group.id}-q${questionIndex + 1}-answer-v3.jpg?v=20260722b`,
  ),
]);

export const LMWARES_PRELOAD_ASSETS = Array.from(
  new Set([
    ...INTRO_ASSETS,
    ...THESIS_STEPS.map((step) => step.asset),
    '/assets/lmwares/tesis/core.webp',
    ...OWNERSHIP_ASSETS.map((asset) => asset.asset),
    ...LMWARES_ASSETS.map((asset) => asset.asset),
    '/assets/lmwares/modelo/licencia.webp',
    ...SOLUTION_MODULES.map((module) => module.asset),
    '/assets/lmwares/operacion/core.webp',
    ...SCALE_LEVELS.map((level) => level.asset),
    '/assets/lmwares/planes/basic.webp',
    '/assets/lmwares/planes/advanced.webp',
    '/assets/lmwares/planes/astra.webp',
    ...FAQ_VISUAL_ASSETS,
  ]),
);

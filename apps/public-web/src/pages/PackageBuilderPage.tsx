import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type CSSProperties,
} from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import type { AccountOverview } from '@starter/api-client';
import type { PublicUser } from '@starter/domain';
import {
  FREE_LAYOUT_PRESETS,
  FREE_PALETTE_PRESETS,
  createFreeIntakeSchema,
} from '@starter/validation';
import { Turnstile } from '../components/Turnstile';
import {
  AccountCenterModal,
  type AccountCenterTab,
} from '../features/account/AccountCenterModal';
import {
  FreePublicationModal,
  type FreePublicationStatus,
} from '../features/package-builder/FreePublicationModal';
import { PackagePreviewModal } from '../features/package-builder/PackagePreviewModal';
import { OpenStreetMapPicker } from '../features/package-builder/OpenStreetMapPicker';
import { api } from '../lib/api';
import { config } from '../lib/config';
import {
  DEFAULT_DRAFT,
  FOUNDATION_MODULES,
  FREE_IMAGE_LIMIT,
  FREE_IMAGE_MAX_BYTES,
  PACKAGE_MODULES,
  PACKAGE_PRICING,
  estimatePackagePrice,
  formatFileSize,
  formatMxPrice,
  getPackageLabel,
  getPlanSeed,
  loadPackageDraft,
  savePackageDraft,
  togglePackageModule,
  type DraftImage,
  type PackageDraft,
  type PackageModule,
  type PackageModuleId,
  type PlanId,
} from '../features/package-builder/packageBuilderModel';
import './packageBuilder.css';

type BuilderView = 'package' | 'summary';

type FreeContactDraft = {
  id: string;
  platform: 'instagram' | 'facebook' | 'x' | 'whatsapp' | 'phone' | 'email' | 'address' | 'website' | 'telegram' | 'tiktok' | 'other';
  value: string;
};

type FreeImageFile = {
  id: string;
  file: File;
};

type FreeSubmitState = {
  status: FreePublicationStatus;
  intakeId?: string;
  slug?: string;
  publicUrl?: string | null;
  message?: string;
};

type FreeLayoutPreset = (typeof FREE_LAYOUT_PRESETS)[number];
type FreePalettePreset = (typeof FREE_PALETTE_PRESETS)[number];

const CONTACT_PLATFORM_OPTIONS: Array<{ value: FreeContactDraft['platform']; label: string }> = [
  { value: 'instagram', label: 'Instagram' },
  { value: 'facebook', label: 'Facebook' },
  { value: 'x', label: 'X' },
  { value: 'whatsapp', label: 'WhatsApp' },
  { value: 'phone', label: 'Teléfono' },
  { value: 'email', label: 'Email' },
  { value: 'website', label: 'Sitio web' },
  { value: 'telegram', label: 'Telegram' },
  { value: 'tiktok', label: 'TikTok' },
  { value: 'other', label: 'Otro' },
];

const FREE_VALIDATION_LABELS: Record<string, string> = {
  slug: 'Subdominio',
  siteName: 'Nombre público',
  contactName: 'Nombre de contacto',
  contactEmail: 'Email de notificación',
  businessDescription: 'Descripción del negocio',
  audience: 'Audiencia o sector',
  sector: 'Sector',
  style: 'Estilo visual',
  primaryAction: 'Acción principal',
  'freePage.hours': 'Horario o disponibilidad',
  'freePage.serviceArea': 'Zona de atención',
  'freePage.trustLine': 'Frase de confianza',
  'freePage.colorPreference': 'Preferencia de colores',
  'freePage.layoutPreset': 'Estilo de composición',
  'freePage.palettePreset': 'Paleta',
  'freePage.location.address': 'Dirección',
  'freePage.location.latitude': 'Latitud',
  'freePage.location.longitude': 'Longitud',
};

const FREE_LAYOUT_OPTIONS: Array<{
  id: FreeLayoutPreset;
  label: string;
  description: string;
}> = [
  { id: 'editorial', label: 'Editorial', description: 'Tipografía con carácter y composición equilibrada.' },
  { id: 'impact', label: 'Impacto', description: 'Bloques fuertes, títulos grandes y llamadas directas.' },
  { id: 'minimal', label: 'Minimal', description: 'Más aire, líneas limpias y atención al contenido.' },
  { id: 'showcase', label: 'Escaparate', description: 'La fotografía domina la portada y la experiencia.' },
];

const FREE_PALETTE_OPTIONS: Array<{
  id: FreePalettePreset;
  label: string;
  colors: [string, string, string];
}> = [
  { id: 'automatic', label: 'Automática', colors: ['#0b284d', '#2a7dff', '#f4f7fb'] },
  { id: 'professional-blue', label: 'Azul profesional', colors: ['#06162c', '#2a7dff', '#f4f7fb'] },
  { id: 'clinical-teal', label: 'Clínica teal', colors: ['#062039', '#0e9f9a', '#f7fbff'] },
  { id: 'industrial-orange', label: 'Industrial', colors: ['#061626', '#e95b24', '#f3efe7'] },
  { id: 'natural-green', label: 'Natural', colors: ['#102719', '#4f8a5b', '#f3f3e8'] },
  { id: 'culinary-terra', label: 'Tierra cálida', colors: ['#32170c', '#c94f25', '#fff4e8'] },
  { id: 'wellness-rose', label: 'Rosa bienestar', colors: ['#351729', '#d85b7b', '#fff6f7'] },
  { id: 'night-fire', label: 'Noche y fuego', colors: ['#05162c', '#f04a2b', '#f6f0e7'] },
];

const COMMERCIAL_SUBMISSION_KEY_STORAGE = 'lmwares.commercial-submission-key.v1';

function formatFreeValidationIssue(issue: {
  code: string;
  message: string;
  path: Array<string | number>;
  maximum?: number | bigint;
  type?: string;
}) {
  const path = issue.path.join('.');
  const label = path.startsWith('freePage.services.')
    ? 'Servicios, productos o capacidades'
    : path.startsWith('contacts.')
      ? 'Contactos visibles'
      : (FREE_VALIDATION_LABELS[path] ?? (path || 'Solicitud Free'));

  if (
    issue.code === 'too_big'
    && issue.type === 'string'
    && (typeof issue.maximum === 'number' || typeof issue.maximum === 'bigint')
  ) {
    return `${label}: máximo ${String(issue.maximum)} caracteres.`;
  }
  return `${label}: ${issue.message}`;
}

const PLAN_COPY: Record<PlanId, { name: string; eyebrow: string; description: string }> = {
  free: {
    name: 'Free',
    eyebrow: 'Presencia inicial',
    description: 'Página informativa en un subdominio LMWares.',
  },
  starter: {
    name: 'Starter',
    eyebrow: 'Operación ligera',
    description: 'Empieza en un subdominio LMWares y puede migrar a dominio personalizado, con Landing, Panel y hasta dos complementos.',
  },
  pro: {
    name: 'Pro',
    eyebrow: 'Capacidad completa',
    description: 'Empieza en un subdominio LMWares y puede migrar a dominio personalizado, con todas las capacidades disponibles.',
  },
};

const MODULE_IMAGE_PATHS: Record<PackageModuleId, string> = {
  landing: '/assets/package-builder/landing-consulting.png',
  panel: '/assets/package-builder/panel.png',
  blog: '/assets/package-builder/blog-frontier-lab.png',
  galleries: '/assets/package-builder/galleries-paintings.png',
  catalog: '/assets/package-builder/catalog.png',
  quote: '/assets/package-builder/formulario.png?v=20260722',
  events: '/assets/package-builder/events.png',
  docs: '/assets/package-builder/docs.png',
  cart: '/assets/package-builder/cart-premium-checkout.png',
  data: '/assets/package-builder/optimization-model-router.png',
};

export function PackageBuilderPage() {
  const navigate = useNavigate();
  const [session, setSession] = useState<PublicUser | null | undefined>(undefined);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const noticeTimerRef = useRef<number | null>(null);
  const [draft, setDraft] = useState<PackageDraft>(() => loadPackageDraft());
  const [view, setView] = useState<BuilderView>('package');
  const [notice, setNotice] = useState('');
  const [fileError, setFileError] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [commercialSubmissionKey, setCommercialSubmissionKey] = useState(() =>
    loadCommercialSubmissionKey(),
  );
  const [previewOpen, setPreviewOpen] = useState(false);
  const [publicationOpen, setPublicationOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const [accountTab, setAccountTab] = useState<AccountCenterTab>('sites');
  const [accountOverview, setAccountOverview] = useState<AccountOverview | null>(null);
  const [accountLoading, setAccountLoading] = useState(false);
  const [accountError, setAccountError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [freeFiles, setFreeFiles] = useState<FreeImageFile[]>([]);
  const [freeSubmit, setFreeSubmit] = useState<FreeSubmitState>({ status: 'idle' });
  const [slugStatus, setSlugStatus] = useState<'idle' | 'checking' | 'available' | 'taken' | 'invalid'>('idle');
  const [freeForm, setFreeForm] = useState(() => ({
    slug: '',
    siteName: '',
    contactName: '',
    contactEmail: '',
    businessDescription: '',
    audience: '',
    sector: '',
    style: 'Editorial refinado',
    layoutPreset: 'editorial' as FreeLayoutPreset,
    palettePreset: 'automatic' as FreePalettePreset,
    primaryAction: 'contactar',
    services: '',
    hours: '',
    serviceArea: '',
    trustLine: '',
    colorPreference: '',
    locationAddress: '',
    locationLatitude: '',
    locationLongitude: '',
    termsAccepted: false,
  }));
  const [freeContacts, setFreeContacts] = useState<FreeContactDraft[]>([
    { id: 'contact-1', platform: 'whatsapp', value: '' },
  ]);
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const [turnstileAttempt, setTurnstileAttempt] = useState(0);
  const [locationStatus, setLocationStatus] = useState('');
  const locationRequestRef = useRef(0);

  const selectedModules = useMemo(
    () => PACKAGE_MODULES.filter(({ id }) => draft.modules.includes(id)),
    [draft.modules],
  );
  const visibleModules = PACKAGE_MODULES;
  const foundationModules = visibleModules.filter(({ id }) => FOUNDATION_MODULES.includes(id));
  const starterComplements = visibleModules.filter(({ tier }) => tier === 'starter');
  const proCapabilities = visibleModules.filter(({ tier }) => tier === 'pro');
  const selectedComplements = selectedModules.filter(({ id }) => !FOUNDATION_MODULES.includes(id));
  const priceEstimate = useMemo(() => estimatePackagePrice(draft), [draft]);
  const locationCoordinates = parseLocationCoordinates(
    freeForm.locationLatitude,
    freeForm.locationLongitude,
  );

  const loadAccount = useCallback(async () => {
    setAccountLoading(true);
    setAccountError('');
    try {
      setAccountOverview(await api.getAccountOverview());
    } catch (error) {
      setAccountError(error instanceof Error ? error.message : 'No se pudo cargar tu cuenta.');
    } finally {
      setAccountLoading(false);
    }
  }, []);

  const markAccountNotificationRead = useCallback(async (notificationId: string) => {
    const result = await api.markAccountNotificationRead(notificationId);
    setAccountOverview((current) => {
      if (!current) return current;
      const wasUnread = current.notifications.some(
        ({ id, readAt }) => id === notificationId && !readAt,
      );
      return {
        ...current,
        unreadCount: wasUnread ? Math.max(0, current.unreadCount - 1) : current.unreadCount,
        notifications: current.notifications.map((notification) =>
          notification.id === notificationId ? result.notification : notification
        ),
      };
    });
  }, []);

  const markAllAccountNotificationsRead = useCallback(async () => {
    await api.markAllAccountNotificationsRead();
    const readAt = new Date().toISOString();
    setAccountOverview((current) =>
      current
        ? {
            ...current,
            unreadCount: 0,
            notifications: current.notifications.map((notification) => ({
              ...notification,
              readAt: notification.readAt ?? readAt,
            })),
          }
        : current
    );
  }, []);

  const acceptCommercialOffer = useCallback(async (
    intakeId: string,
    offerId: string,
    termsVersion: string,
  ) => {
    await api.acceptCommercialOffer(intakeId, offerId, termsVersion);
    await loadAccount();
  }, [loadAccount]);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    const previousTitle = document.title;
    document.body.style.overflow = 'auto';
    document.title = 'Configura tu paquete · LMWares';

    return () => {
      document.body.style.overflow = previousOverflow;
      document.title = previousTitle;
      if (noticeTimerRef.current !== null) window.clearTimeout(noticeTimerRef.current);
    };
  }, []);

  useEffect(() => {
    savePackageDraft(draft);
  }, [draft]);

  useEffect(() => {
    let active = true;
    api.getAuthSession()
      .then((result) => {
        if (active) setSession(result.authenticated ? result.user : null);
      })
      .catch(() => {
        if (active) setSession(null);
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!session) return;
    setFreeForm((current) => ({
      ...current,
      contactName: current.contactName || session.name || '',
      contactEmail: session.email,
    }));
    void loadAccount();
  }, [loadAccount, session]);

  useEffect(() => {
    if (freeSubmit.status !== 'queued' || !freeSubmit.intakeId) return;
    let cancelled = false;
    let timer: number | undefined;

    const poll = async () => {
      try {
        const result = await api.getFreeIntakeStatus(freeSubmit.intakeId!);
        if (cancelled) return;
        if (result.publicUrl) {
          setFreeSubmit((current) => ({
            ...current,
            status: 'published',
            publicUrl: result.publicUrl,
            message: result.intake.status === 'notified'
              ? 'Tu página Free ya está publicada. También enviamos el enlace a tu email.'
              : 'Tu página Free ya está publicada. El enlace quedó programado para tu email.',
          }));
          void loadAccount();
          setPublicationOpen(true);
          return;
        }
        if (
          result.job?.status === 'failed' ||
          ['generation_failed', 'moderation_hold', 'manual_review'].includes(result.intake.status)
        ) {
          setFreeSubmit((current) => ({
            ...current,
            status: 'failed',
            message: result.job?.errorMessage ?? 'La generación requiere revisión.',
          }));
          setPublicationOpen(true);
          return;
        }
      } catch {
        // Una interrupción breve no invalida el trabajo ya en cola.
      }
      if (!cancelled) timer = window.setTimeout(poll, 3000);
    };

    timer = window.setTimeout(poll, 1500);
    return () => {
      cancelled = true;
      if (timer !== undefined) window.clearTimeout(timer);
    };
  }, [freeSubmit.intakeId, freeSubmit.status, loadAccount]);

  if (session === undefined) {
    return (
      <div className="lmw-builder-shell lmw-auth-shell">
        <main className="lmw-auth-layout">
          <section className="lmw-auth-card">
            <p>Validando tu sesión segura...</p>
          </section>
        </main>
      </div>
    );
  }
  if (!session) return <Navigate replace to="/acceso" />;

  const flashNotice = (message: string) => {
    setNotice(message);
    if (noticeTimerRef.current !== null) window.clearTimeout(noticeTimerRef.current);
    noticeTimerRef.current = window.setTimeout(() => setNotice(''), 3200);
  };

  const updateDraft = (changes: Partial<PackageDraft>) => {
    setDraft((current) => ({ ...current, ...changes, updatedAt: new Date().toISOString() }));
    setSubmitted(false);
    const nextKey = crypto.randomUUID();
    localStorage.setItem(COMMERCIAL_SUBMISSION_KEY_STORAGE, nextKey);
    setCommercialSubmissionKey(nextKey);
  };

  const updateFreeForm = (changes: Partial<typeof freeForm>) => {
    setFreeForm((current) => ({ ...current, ...changes }));
    setSubmitted(false);
    setFreeSubmit({ status: 'idle' });
    if ('slug' in changes) setSlugStatus('idle');
  };

  const updateFreeContact = (id: string, changes: Partial<FreeContactDraft>) => {
    setFreeContacts((current) =>
      current.map((contact) => (contact.id === id ? { ...contact, ...changes } : contact)),
    );
    setSubmitted(false);
    setFreeSubmit({ status: 'idle' });
  };

  const addFreeContact = () => {
    setFreeContacts((current) => [
      ...current,
      { id: `contact-${Date.now()}-${current.length}`, platform: 'instagram', value: '' },
    ]);
  };

  const removeFreeContact = (id: string) => {
    setFreeContacts((current) =>
      current.length === 1 ? current : current.filter((contact) => contact.id !== id),
    );
  };

  const useCurrentLocation = () => {
    if (!navigator.geolocation) {
      setLocationStatus('Este navegador no ofrece ubicación.');
      return;
    }
    const requestId = ++locationRequestRef.current;
    setLocationStatus('Esperando permiso del navegador…');
    navigator.geolocation.getCurrentPosition(
      async ({ coords }) => {
        const latitude = Number(coords.latitude.toFixed(6));
        const longitude = Number(coords.longitude.toFixed(6));
        updateFreeForm({
          locationAddress: '',
          locationLatitude: latitude.toFixed(6),
          locationLongitude: longitude.toFixed(6),
        });
        setLocationStatus('Ubicación obtenida. Buscando la dirección cercana…');
        try {
          const response = await api.reverseMapLocation(latitude, longitude);
          if (requestId !== locationRequestRef.current) return;
          updateFreeForm({
            locationAddress: response.result?.address
              || `Ubicación actual (${latitude.toFixed(6)}, ${longitude.toFixed(6)})`,
          });
          setLocationStatus(
            response.result
              ? 'Ubicación actual y dirección confirmadas.'
              : 'Punto guardado. Puedes ajustar abajo el texto público de la dirección.',
          );
        } catch {
          if (requestId !== locationRequestRef.current) return;
          updateFreeForm({
            locationAddress: `Ubicación actual (${latitude.toFixed(6)}, ${longitude.toFixed(6)})`,
          });
          setLocationStatus('Punto guardado. Puedes ajustar abajo el texto público de la dirección.');
        }
      },
      () => setLocationStatus('No pudimos obtener la ubicación. Puedes buscarla o marcarla directamente en el mapa.'),
      { enableHighAccuracy: true, timeout: 10_000, maximumAge: 60_000 },
    );
  };

  const checkFreeSlug = async () => {
    const slug = normalizeFreeSlug(freeForm.slug);
    updateFreeForm({ slug });
    if (!slug) {
      setSlugStatus('invalid');
      return;
    }

    try {
      setSlugStatus('checking');
      const result = await api.checkFreeSlug(slug);
      setSlugStatus(result.available ? 'available' : 'taken');
    } catch {
      setSlugStatus('invalid');
    }
  };

  const selectPlan = (plan: PlanId) => {
    updateDraft({
      plan,
      modules: getPlanSeed(plan),
      marketing: plan === 'free' ? false : draft.marketing,
    });
    setView('package');
    flashNotice(`${PLAN_COPY[plan].name} cargado como punto de partida.`);
  };

  const toggleModule = (moduleId: PackageModuleId) => {
    if (FOUNDATION_MODULES.includes(moduleId)) {
      flashNotice('Landing y Panel ya están incluidos en este plan.');
      return;
    }

    if (draft.plan === 'starter') {
      const module = PACKAGE_MODULES.find(({ id }) => id === moduleId);
      if (module?.tier === 'pro') {
        flashNotice(`${module.name} es una capacidad exclusiva de Pro.`);
        return;
      }

      const currentComplements = draft.modules.filter((id) => !FOUNDATION_MODULES.includes(id));
      if (currentComplements.includes(moduleId)) {
        updateDraft({ modules: [...FOUNDATION_MODULES, ...currentComplements.filter((id) => id !== moduleId)] });
        flashNotice(`${module?.name ?? 'El complemento'} se retiró de Starter.`);
        return;
      }

      if (currentComplements.length >= 2) {
        flashNotice('Starter permite hasta dos complementos. Quita uno antes de añadir otro.');
        return;
      }

      updateDraft({ modules: [...FOUNDATION_MODULES, ...currentComplements, moduleId] });
      flashNotice(`${module?.name ?? 'El complemento'} se añadió a Starter.`);
      return;
    }

    const result = togglePackageModule(draft.modules, moduleId);
    if (result.message) {
      flashNotice(result.message);
      return;
    }

    updateDraft({ modules: result.modules });
  };

  const toggleMarketing = () => {
    const marketing = !draft.marketing;
    updateDraft({ marketing });
  };

  const addImages = (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);
    event.target.value = '';
    setFileError('');
    if (files.length === 0) return;

    const rejectedType = files.find((file) => !file.type.startsWith('image/'));
    if (rejectedType) {
      setFileError(`${rejectedType.name} no es una imagen válida.`);
      return;
    }

    const rejectedSize = files.find((file) => file.size > FREE_IMAGE_MAX_BYTES);
    if (rejectedSize) {
      setFileError(`${rejectedSize.name} supera el máximo de 5 MB.`);
      return;
    }

    const known = new Set(draft.images.map((image) => `${image.name}:${image.size}`));
    const additions: Array<{ draft: DraftImage; file: File }> = files
      .filter((file) => !known.has(`${file.name}:${file.size}`))
      .map((file, index) => {
        const id = `${file.name}-${file.size}-${file.lastModified}-${index}-${crypto.randomUUID()}`;
        return {
          draft: {
            id,
            name: file.name,
            size: file.size,
            type: file.type,
          },
          file,
        };
      });

    if (draft.images.length + additions.length > FREE_IMAGE_LIMIT) {
      setFileError(`El plan Free permite hasta ${FREE_IMAGE_LIMIT} imágenes.`);
      return;
    }

    setFreeFiles((current) => [...current, ...additions.map(({ draft: image, file }) => ({ id: image.id, file }))]);
    updateDraft({ images: [...draft.images, ...additions.map(({ draft: image }) => image)] });
  };

  const removeImage = (imageId: string) => {
    setFreeFiles((current) => current.filter(({ id }) => id !== imageId));
    updateDraft({ images: draft.images.filter(({ id }) => id !== imageId) });
  };

  const resetDraft = () => {
    updateDraft({ ...DEFAULT_DRAFT, updatedAt: new Date().toISOString() });
    setFreeFiles([]);
    setFreeForm({
      slug: '',
      siteName: '',
      contactName: session.name ?? '',
      contactEmail: session.email,
      businessDescription: '',
      audience: '',
      sector: '',
      style: 'Editorial refinado',
      layoutPreset: 'editorial',
      palettePreset: 'automatic',
      primaryAction: 'contactar',
      services: '',
      hours: '',
      serviceArea: '',
      trustLine: '',
      colorPreference: '',
      locationAddress: '',
      locationLatitude: '',
      locationLongitude: '',
      termsAccepted: false,
    });
    setFreeContacts([{ id: 'contact-1', platform: 'whatsapp', value: '' }]);
    setFreeSubmit({ status: 'idle' });
    setSlugStatus('idle');
    setLocationStatus('');
    setView('package');
    setFileError('');
    flashNotice('Restauramos el ejemplo Starter.');
  };

  const signOut = async () => {
    try {
      await api.logout();
    } finally {
      setSession(null);
      navigate('/acceso');
    }
  };

  const openAccount = (tab: AccountCenterTab) => {
    setAccountTab(tab);
    setAccountOpen(true);
    if (!accountOverview && !accountLoading) void loadAccount();
  };

  const submitDraft = async () => {
    if (draft.plan !== 'free') {
      setFileError('');
      setSubmitting(true);
      try {
        const result = await api.createCommercialPackageIntake({
          plan: draft.plan,
          modules: draft.modules,
          marketing: draft.marketing,
        }, commercialSubmissionKey);
        setSubmitted(true);
        flashNotice(`Solicitud ${result.intake.id.slice(0, 8)} enviada para revisión.`);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'No se pudo enviar la solicitud.';
        setFileError(message);
      } finally {
        setSubmitting(false);
      }
      return;
    }

    const contacts = freeContacts
      .map((contact) => ({ ...contact, value: contact.value.trim() }))
      .filter((contact) => contact.value.length > 0);
    const locationRequested = Boolean(
      freeForm.locationAddress.trim()
      || freeForm.locationLatitude.trim()
      || freeForm.locationLongitude.trim(),
    );
    const location = locationRequested && locationCoordinates
      ? {
          address: freeForm.locationAddress.trim(),
          latitude: locationCoordinates.latitude,
          longitude: locationCoordinates.longitude,
          zoom: 16,
        }
      : undefined;

    if (!freeForm.slug || !freeForm.siteName || !freeForm.contactName || !freeForm.contactEmail) {
      setFileError('Completa nombre, email, sitio y subdominio antes de enviar.');
      return;
    }
    if (freeForm.businessDescription.trim().length < 20) {
      setFileError('Describe el negocio con un poco más de detalle.');
      return;
    }
    if (freeForm.audience.trim().length < 6) {
      setFileError('Indica la audiencia o sector clave.');
      return;
    }
    const services = parseFreeLines(freeForm.services);
    if (services.length < 2) {
      setFileError('Agrega al menos dos servicios, productos o capacidades principales.');
      return;
    }
    if (freeForm.hours.trim().length < 4) {
      setFileError('Indica el horario o disponibilidad que puede publicarse.');
      return;
    }
    if (freeForm.serviceArea.trim().length < 4) {
      setFileError('Indica la zona de atención o cobertura.');
      return;
    }
    if (
      locationRequested
      && (!location || location.address.length < 4)
    ) {
      setFileError('Para publicar el mapa agrega la dirección y coordenadas válidas.');
      return;
    }
    if (contacts.length === 0) {
      setFileError('Agrega al menos un dato de contacto visible.');
      return;
    }
    if (location && contacts.length >= 12 && !contacts.some(({ platform }) => platform === 'address')) {
      setFileError('El mapa ocupa un dato de contacto; elimina una fila antes de enviar.');
      return;
    }
    if (freeFiles.length < 1) {
      setFileError('Adjunta al menos una imagen real antes de enviar.');
      return;
    }
    if (!freeForm.termsAccepted) {
      setFileError('Acepta la publicación de la información enviada.');
      return;
    }
    if (!turnstileToken) {
      setFileError('Completa la verificación anti-spam antes de enviar.');
      return;
    }

    const contactsForPayload = location && !contacts.some(({ platform }) => platform === 'address')
      ? [
          ...contacts,
          {
            id: 'location-address',
            platform: 'address' as const,
            value: location.address,
          },
        ]
      : contacts;
    const selectedPalette = FREE_PALETTE_OPTIONS.find(({ id }) => id === freeForm.palettePreset);
    const freeIntakePayload = {
      slug: normalizeFreeSlug(freeForm.slug),
      siteName: freeForm.siteName.trim(),
      contactName: freeForm.contactName.trim(),
      contactEmail: freeForm.contactEmail.trim(),
      businessDescription: freeForm.businessDescription.trim(),
      audience: freeForm.audience.trim(),
      sector: freeForm.sector.trim() || undefined,
      style: freeForm.style.trim(),
      primaryAction: freeForm.primaryAction.trim(),
      freePage: {
        services,
        hours: freeForm.hours.trim(),
        serviceArea: freeForm.serviceArea.trim(),
        trustLine: freeForm.trustLine.trim() || undefined,
        colorPreference:
          freeForm.palettePreset === 'automatic'
            ? undefined
            : selectedPalette?.label,
        layoutPreset: freeForm.layoutPreset,
        palettePreset: freeForm.palettePreset,
        location,
      },
      contacts: contactsForPayload.map(({ id: _id, ...contact }) => ({
        ...contact,
        publicVisible: true,
      })),
      termsAccepted: true as const,
      turnstileToken,
    };
    const validatedPayload = createFreeIntakeSchema.safeParse(freeIntakePayload);
    if (!validatedPayload.success) {
      setFileError(formatFreeValidationIssue(validatedPayload.error.issues[0]!));
      return;
    }

    setFileError('');
    setSubmitting(true);
    setFreeSubmit({ status: 'checking', message: 'Creando solicitud Free...' });
    setPublicationOpen(true);

    try {
      const created = await api.createFreeIntake(validatedPayload.data);
      setTurnstileToken(null);

      setFreeSubmit({ status: 'uploading', intakeId: created.id, slug: created.slug, message: 'Subiendo imágenes...' });
      for (const { file } of freeFiles) {
        await api.uploadFreeIntakeImage(created.id, file);
      }

      const submittedFree = await api.submitFreeIntake(created.id);
      setSubmitted(true);
      setFreeSubmit({
        status: 'queued',
        intakeId: submittedFree.id,
        slug: submittedFree.slug,
        publicUrl: submittedFree.publicUrl,
        message: `Solicitud enviada. Quedó en cola para ${submittedFree.slug}.lmwares.com.`,
      });
      flashNotice(`Solicitud Free enviada: ${submittedFree.slug}.lmwares.com`);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'No se pudo enviar la solicitud Free.';
      setTurnstileToken(null);
      setTurnstileAttempt((current) => current + 1);
      setFreeSubmit({ status: 'failed', message });
      setPublicationOpen(true);
      setFileError(message);
    } finally {
      setSubmitting(false);
    }
  };

  const renderModuleCard = (module: PackageModule) => {
    const selected = draft.modules.includes(module.id);
    const included = FOUNDATION_MODULES.includes(module.id);
    const locked = draft.plan === 'starter' && module.tier === 'pro';
    const starterAtLimit = draft.plan === 'starter' && selectedComplements.length >= 2;
    const stateLabel = included
      ? 'Incluido en la base'
      : locked
        ? 'Bloqueado · requiere Pro'
        : draft.plan === 'starter'
          ? selected ? 'Seleccionado · quitar' : starterAtLimit ? 'Límite · quita uno' : 'Añadir complemento'
        : selected ? 'Añadido' : 'Añadir';

    return (
      <button
        aria-pressed={selected}
        aria-disabled={locked}
        className={`lmw-module-card lmw-module-card--${module.tier} lmw-module-card--${module.id}${selected ? ' is-selected' : ''}${included ? ' is-included' : ''}${locked ? ' is-locked' : ''}`}
        disabled={included}
        key={module.id}
        onClick={() => toggleModule(module.id)}
        type="button"
      >
        <span className="lmw-module-media" aria-hidden="true">
          <img alt="" src={MODULE_IMAGE_PATHS[module.id]} />
        </span>
        <span className="lmw-module-copy">
          <small>{module.eyebrow}{module.tier === 'pro' ? ' · PRO' : ''}</small>
          <strong>{module.name}</strong>
          <em>{module.description}</em>
        </span>
        {locked ? <span className="lmw-module-lock" aria-hidden="true">Solo Pro</span> : null}
        <span className="lmw-module-state"><i />{stateLabel}</span>
      </button>
    );
  };

  return (
    <div className="lmw-builder-shell lmw-configurator-shell">
      <div className="lmw-builder-backdrop" aria-hidden="true"><i /><i /><i /></div>

      <header className="lmw-builder-topbar">
        <Link className="lmw-builder-brand" to="/">
          <span>LM</span>WARES<i />
        </Link>

        <ol className="lmw-builder-progress" aria-label="Progreso del configurador">
          {['Acceso', 'Necesidades', 'Paquete', 'Resumen'].map((step, index) => {
            const activeIndex = view === 'summary' ? 3 : 2;
            return (
              <li className={index === activeIndex ? 'is-active' : index < activeIndex ? 'is-done' : ''} key={step}>
                <span>{index < activeIndex ? '✓' : index + 1}</span><b>{step}</b>
              </li>
            );
          })}
        </ol>

        <div className="lmw-builder-account">
          <button
            aria-label={`Notificaciones${accountOverview?.unreadCount ? `: ${accountOverview.unreadCount} sin leer` : ''}`}
            className="lmw-builder-account__notifications"
            onClick={() => openAccount('notifications')}
            type="button"
          >
            <svg aria-hidden="true" viewBox="0 0 24 24">
              <path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4" />
            </svg>
            {accountOverview?.unreadCount ? <i>{accountOverview.unreadCount}</i> : null}
          </button>
          <button
            aria-label="Abrir mi cuenta y mis sitios"
            className="lmw-builder-account__profile"
            onClick={() => openAccount('sites')}
            type="button"
          >
            <span>{userInitials(session)}</span>
            <b>{session.name ?? 'Cuenta LMWares'}<small>{session.email}</small></b>
            <i aria-hidden="true">⌄</i>
          </button>
        </div>
      </header>

      {notice ? <div className="lmw-builder-toast" role="status"><i />{notice}</div> : null}

      {view === 'package' ? (
        <main className="lmw-configurator">
          <header className="lmw-configurator-heading">
            <div>
              <p className="lmw-builder-eyebrow">02 / Configuración</p>
              <h1>Arma tu paquete</h1>
              <span>Primero elige un plan. Después configura únicamente lo que ese plan permite.</span>
            </div>
            <button onClick={resetDraft} type="button">Restaurar ejemplo</button>
          </header>

          <nav className="lmw-plan-rail" aria-label="Comenzar desde un plan">
            {(['free', 'starter', 'pro'] as PlanId[]).map((plan) => (
              <button
                className={draft.plan === plan ? 'is-active' : ''}
                key={plan}
                onClick={() => selectPlan(plan)}
                type="button"
              >
                <span>{plan === 'free' ? '○' : plan === 'starter' ? '★' : '♢'}</span>
                <span className="lmw-plan-rail__copy">
                  <b>{PLAN_COPY[plan].name}</b>
                  <em>{PLAN_COPY[plan].eyebrow}</em>
                </span>
                {draft.plan === plan ? <small>Activo</small> : null}
              </button>
            ))}
          </nav>

          <section className="lmw-configurator-workspace">
            <div className="lmw-plan-context">
              <p className="lmw-builder-eyebrow">{PLAN_COPY[draft.plan].name} / Alcance disponible</p>
              <h2>
                {draft.plan === 'free'
                  ? 'Una presencia simple para comenzar.'
                  : draft.plan === 'starter'
                    ? 'La base está incluida. Elige hasta dos complementos.'
                    : 'Todo está disponible. Activa sólo lo que usarás.'}
              </h2>
            </div>

            {draft.plan === 'free' ? (
              <div className="lmw-free-package">
                <article className="lmw-free-capability">
                  <span className="lmw-free-capability__glyph">▤</span>
                  <div>
                    <small>Incluido en Free</small>
                    <h3>Página informativa</h3>
                  <p>Una página única, clara y publicada temporalmente en un subdominio de LMWares.</p>
                  </div>
                  <ul>
                    <li><b>01</b><span>Una sola página</span></li>
                    <li><b>02</b><span>Hasta 5 imágenes</span></li>
                    <li><b>03</b><span>Máximo 5 MB cada una</span></li>
                  </ul>
                </article>

                <section className="lmw-free-form">
                  <div className="lmw-free-form__header">
                    <p className="lmw-builder-eyebrow">Solicitud Free</p>
                    <h2>Datos para construir tu página.</h2>
                    <span>Con esto armaremos una instrucción estructurada para generar una página informativa.</span>
                  </div>

                  <div className="lmw-free-form__grid">
                    <label>
                      <span>Nombre público</span>
                      <input
                        onChange={(event) => updateFreeForm({ siteName: event.target.value })}
                        placeholder="Tu marca aquí"
                        type="text"
                        value={freeForm.siteName}
                      />
                    </label>
                    <label>
                      <span>Subdominio deseado</span>
                      <div className="lmw-free-slug">
                        <input
                          onBlur={checkFreeSlug}
                          onChange={(event) => updateFreeForm({ slug: event.target.value })}
                          placeholder="mi-negocio"
                          type="text"
                          value={freeForm.slug}
                        />
                        <button disabled={slugStatus === 'checking'} onClick={checkFreeSlug} type="button">
                          {slugStatus === 'checking' ? '...' : 'Verificar'}
                        </button>
                      </div>
                      <small className={`lmw-free-slug-status is-${slugStatus}`}>
                        {slugStatus === 'available'
                          ? `${normalizeFreeSlug(freeForm.slug)}.lmwares.com disponible`
                          : slugStatus === 'taken'
                            ? 'Ese subdominio está ocupado o reservado.'
                            : slugStatus === 'invalid'
                              ? 'Usa letras, números y guiones.'
                              : 'Se publicará como subdominio de LMWares.'}
                      </small>
                    </label>
                    <label>
                      <span>Nombre de contacto</span>
                      <input
                        onChange={(event) => updateFreeForm({ contactName: event.target.value })}
                        placeholder="Nombre de quien solicita"
                        type="text"
                        value={freeForm.contactName}
                      />
                    </label>
                    <label>
                      <span>Email de notificación</span>
                      <input
                        aria-readonly="true"
                        readOnly
                        type="email"
                        value={freeForm.contactEmail}
                      />
                      <small>Se toma de la cuenta con la que iniciaste sesión.</small>
                    </label>
                    <label className="is-wide">
                      <span>¿De qué trata?</span>
                      <textarea
                        onChange={(event) => updateFreeForm({ businessDescription: event.target.value })}
                        placeholder="Describe el negocio, servicio, producto, proyecto o actividad que quieres presentar."
                        value={freeForm.businessDescription}
                      />
                    </label>
                    <label>
                      <span>Audiencia o sector</span>
                      <input
                        onChange={(event) => updateFreeForm({ audience: event.target.value })}
                        placeholder="Ej. clientes locales, pacientes, inversionistas"
                        type="text"
                        value={freeForm.audience}
                      />
                    </label>
                    <label>
                      <span>Sector opcional</span>
                      <input
                        onChange={(event) => updateFreeForm({ sector: event.target.value })}
                        placeholder="Salud, inmobiliario, arte..."
                        type="text"
                        value={freeForm.sector}
                      />
                    </label>
                    <label>
                      <span>Acción principal</span>
                      <input
                        onChange={(event) => updateFreeForm({ primaryAction: event.target.value })}
                        placeholder="Contactar, reservar, llamar..."
                        type="text"
                        value={freeForm.primaryAction}
                      />
                    </label>
                    <label className="is-wide">
                      <span>Servicios, productos o capacidades principales</span>
                      <textarea
                        onChange={(event) => updateFreeForm({ services: event.target.value })}
                        placeholder="Escribe uno por línea. Ej. Herramientas manuales, plomería, electricidad, materiales para obra ligera."
                        value={freeForm.services}
                      />
                      <small>Se mostrarán sólo estos puntos. No inventaremos servicios que no hayas escrito aquí.</small>
                    </label>
                    <label>
                      <span>Horario o disponibilidad</span>
                      <input
                        onChange={(event) => updateFreeForm({ hours: event.target.value })}
                        placeholder="Ej. Lun-sáb 8:00–18:30 o atención bajo cita"
                        type="text"
                        value={freeForm.hours}
                      />
                    </label>
                    <label>
                      <span>Zona de atención</span>
                      <input
                        onChange={(event) => updateFreeForm({ serviceArea: event.target.value })}
                        placeholder="Ej. Colonia, ciudad, zona o modalidad remota"
                        type="text"
                        value={freeForm.serviceArea}
                      />
                    </label>
                    <label className="is-wide">
                      <span>Frase de confianza opcional</span>
                      <input
                        onChange={(event) => updateFreeForm({ trustLine: event.target.value })}
                        placeholder="Ej. Atención local, entregas en zona y asesoría práctica."
                        type="text"
                        value={freeForm.trustLine}
                      />
                    </label>
                    <fieldset className="lmw-free-design-selector is-wide">
                      <legend>Composición visual</legend>
                      <p>Elige cómo se organizarán portada, servicios, galería y contacto.</p>
                      <div className="lmw-free-layout-options">
                        {FREE_LAYOUT_OPTIONS.map((option) => (
                          <button
                            aria-pressed={freeForm.layoutPreset === option.id}
                            className={freeForm.layoutPreset === option.id ? 'is-selected' : ''}
                            key={option.id}
                            onClick={() =>
                              updateFreeForm({
                                layoutPreset: option.id,
                                style: option.label,
                              })
                            }
                            type="button"
                          >
                            <i className={`is-${option.id}`}><span /><span /><span /></i>
                            <b>{option.label}</b>
                            <small>{option.description}</small>
                          </button>
                        ))}
                      </div>
                    </fieldset>
                    <fieldset className="lmw-free-design-selector is-wide">
                      <legend>Paleta de color</legend>
                      <p>Automática usa el sector; las demás fijan exactamente la familia cromática.</p>
                      <div className="lmw-free-palette-options">
                        {FREE_PALETTE_OPTIONS.map((option) => (
                          <button
                            aria-pressed={freeForm.palettePreset === option.id}
                            className={freeForm.palettePreset === option.id ? 'is-selected' : ''}
                            key={option.id}
                            onClick={() => updateFreeForm({ palettePreset: option.id })}
                            style={{
                              '--palette-a': option.colors[0],
                              '--palette-b': option.colors[1],
                              '--palette-c': option.colors[2],
                            } as CSSProperties}
                            type="button"
                          >
                            <i><span /><span /><span /></i>
                            <b>{option.label}</b>
                          </button>
                        ))}
                      </div>
                    </fieldset>
                  </div>

                  <section className="lmw-free-location">
                    <header>
                      <div>
                        <p className="lmw-builder-eyebrow">Ubicación y mapa · Opcional</p>
                        <h3>Marca el punto exacto del local.</h3>
                        <span>Busca el negocio o la dirección y selecciona el punto directamente, sin copiar coordenadas.</span>
                      </div>
                      <button onClick={useCurrentLocation} type="button">Usar mi ubicación actual</button>
                    </header>
                    <OpenStreetMapPicker
                        address={freeForm.locationAddress}
                        latitude={locationCoordinates?.latitude ?? null}
                        longitude={locationCoordinates?.longitude ?? null}
                        onAddressChange={(locationAddress) => updateFreeForm({ locationAddress })}
                        onClear={() => {
                          locationRequestRef.current += 1;
                          updateFreeForm({
                            locationAddress: '',
                            locationLatitude: '',
                            locationLongitude: '',
                          });
                          setLocationStatus('Ubicación eliminada.');
                        }}
                        onSelect={({ address, latitude, longitude }) => {
                          locationRequestRef.current += 1;
                          updateFreeForm({
                            locationAddress: address,
                            locationLatitude: latitude.toFixed(6),
                            locationLongitude: longitude.toFixed(6),
                          });
                          setLocationStatus('Punto seleccionado dentro del mapa.');
                        }}
                        status={locationStatus}
                    />
                  </section>

                  <div className="lmw-free-contacts">
                    <div>
                      <p className="lmw-builder-eyebrow">Contactos visibles</p>
                      <button onClick={addFreeContact} type="button">Agregar fila</button>
                    </div>
                    {freeContacts.map((contact) => (
                      <div className="lmw-free-contact-row" key={contact.id}>
                        <select
                          onChange={(event) =>
                            updateFreeContact(contact.id, { platform: event.target.value as FreeContactDraft['platform'] })
                          }
                          value={contact.platform}
                        >
                          {CONTACT_PLATFORM_OPTIONS.map((option) => (
                            <option key={option.value} value={option.value}>{option.label}</option>
                          ))}
                        </select>
                        <input
                          onChange={(event) => updateFreeContact(contact.id, { value: event.target.value })}
                          placeholder="@usuario, teléfono, dirección o URL"
                          type="text"
                          value={contact.value}
                        />
                        <button onClick={() => removeFreeContact(contact.id)} type="button">×</button>
                      </div>
                    ))}
                  </div>

                </section>

                <section className="lmw-free-assets">
                  <div>
                    <p className="lmw-builder-eyebrow">Contenido de tu página</p>
                    <h2>Carga las imágenes que quieres utilizar.</h2>
                    <span>Se subirán a cuarentena y luego se publicarán sólo derivados seguros.</span>
                  </div>
                  <button onClick={() => fileInputRef.current?.click()} type="button">
                    Añadir imágenes <b>{draft.images.length}/{FREE_IMAGE_LIMIT}</b>
                  </button>
                  <input
                    accept="image/jpeg,image/png,image/webp"
                    hidden
                    multiple
                    onChange={addImages}
                    ref={fileInputRef}
                    type="file"
                  />
                  {fileError ? <p className="lmw-free-assets__error">{fileError}</p> : null}
                  {freeSubmit.message ? (
                    <p className={`lmw-free-assets__status is-${freeSubmit.status}`}>{freeSubmit.message}</p>
                  ) : null}
                  {freeSubmit.publicUrl ? (
                    <button
                      className="lmw-free-assets__status is-published"
                      onClick={() => setPublicationOpen(true)}
                      type="button"
                    >
                      Ver publicación: {freeSubmit.slug}.lmwares.com ↗
                    </button>
                  ) : null}
                  {draft.images.length > 0 ? (
                    <ul>
                      {draft.images.map((image) => (
                        <li key={image.id}>
                          <span><b>{image.name}</b><small>{formatFileSize(image.size)}</small></span>
                          <button onClick={() => removeImage(image.id)} type="button" aria-label={`Quitar ${image.name}`}>×</button>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </section>
              </div>
            ) : (
              <div className="lmw-module-sections">
                <section className="lmw-module-group lmw-module-group--foundation">
                  <header>
                    <div>
                      <p className="lmw-builder-eyebrow">Base incluida</p>
                      <h3>Landing + Panel</h3>
                    </div>
                    <span>No tienes que seleccionarlos. Ambos forman parte del plan.</span>
                  </header>
                  <div className="lmw-module-grid lmw-module-grid--foundation">
                    {foundationModules.map(renderModuleCard)}
                  </div>
                </section>

                <section className="lmw-module-group lmw-module-group--choices">
                  <header>
                    <div>
                      <p className="lmw-builder-eyebrow">Personaliza tu alcance</p>
                      <h3>{draft.plan === 'starter' ? 'Elige hasta dos complementos' : 'Elige cualquier combinación'}</h3>
                    </div>
                    <span>
                      {draft.plan === 'starter'
                        ? 'Carrito y Optimization se muestran bloqueados porque requieren Pro.'
                        : 'Activa únicamente las capacidades que utilizarás.'}
                    </span>
                  </header>
                  <div className="lmw-module-grid lmw-module-grid--choices">
                    {starterComplements.map(renderModuleCard)}
                  </div>
                </section>

                <section className="lmw-module-group lmw-module-group--pro">
                  <header>
                    <div>
                      <p className="lmw-builder-eyebrow">Capacidades Pro</p>
                      <h3>Más operación. Más inteligencia.</h3>
                    </div>
                    <span>
                      {draft.plan === 'starter'
                        ? 'Disponibles al cambiar a Pro.'
                        : 'Activa únicamente las capacidades que formarán parte de tu sistema.'}
                    </span>
                  </header>
                  <div className="lmw-module-grid lmw-module-grid--pro">
                    {proCapabilities.map(renderModuleCard)}
                  </div>
                </section>
              </div>
            )}
          </section>

          <aside className={`lmw-recommendation lmw-recommendation--${draft.plan}`}>
            <p><i>{draft.plan === 'starter' ? '★' : draft.plan === 'pro' ? '♢' : '○'}</i> Plan activo</p>
            <h2>{PLAN_COPY[draft.plan].name}</h2>
            <span className="lmw-recommendation__eyebrow">{PLAN_COPY[draft.plan].eyebrow}</span>
            <p className="lmw-recommendation__description">{PLAN_COPY[draft.plan].description}</p>

            <div className="lmw-recommendation__selection">
              {draft.plan === 'free' ? (
                <>
                  <div><i>01</i><span><b>Página informativa</b><small>Única capacidad del plan</small></span></div>
                  <div><i>02</i><span><b>Subdominio LMWares</b><small>Durante esta etapa inicial</small></span></div>
                  <div><i>03</i><span><b>5 imágenes</b><small>Máximo 5 MB por archivo</small></span></div>
                </>
              ) : (
                <>
                  <div><i>01</i><span><b>Landing + Panel</b><small>Base incluida, sin decisiones extra</small></span></div>
                  <div><i>02</i><span><b>Subdominio desde el inicio</b><small>Dominio propio opcional después</small></span></div>
                  <div><i>03</i><span><b>{selectedComplements.length} {selectedComplements.length === 1 ? 'complemento elegido' : 'complementos elegidos'}</b><small>{selectedComplements.length > 0 ? selectedComplements.map(({ name }) => name).join(' · ') : 'Todavía no has añadido ninguno'}</small></span></div>
                  <div><i>04</i><span><b>{draft.plan === 'pro' ? 'Todas las capacidades' : 'Hasta 2 de 6 compatibles'}</b><small>{draft.plan === 'pro' ? 'Incluye Carrito y Optimization' : 'Carrito y Optimization requieren Pro'}</small></span></div>
                </>
              )}
            </div>

            <strong className="lmw-recommendation__label">
              {getPackageLabel(draft.plan, draft.modules)}
            </strong>

            <div className="lmw-price-card" aria-label="Estimación de precio">
              <span>Implementación inicial</span>
              <strong>{formatMxPrice(priceEstimate.implementation)}</strong>
              <small>{priceEstimate.implementationLabel}</small>
              {draft.plan !== 'free' ? (
                <ul>
                  <li>Mantenimiento opcional desde {formatMxPrice(priceEstimate.maintenanceFrom)}/mes</li>
                  <li>Operación con agente desde {formatMxPrice(priceEstimate.operationalMaintenanceFrom)}/mes</li>
                  <li>Seguridad avanzada desde {formatMxPrice(priceEstimate.securityAddOnFrom)}/mes</li>
                </ul>
              ) : (
                <p>Sin pago inicial mientras el flujo permanezca automatizado y en cola.</p>
              )}
            </div>

            {draft.plan !== 'free' ? (
              <button
                aria-pressed={draft.marketing}
                className={`lmw-marketing-toggle${draft.marketing ? ' is-active' : ''}`}
                onClick={toggleMarketing}
                type="button"
              >
                <i>✦</i>
                <span><b>Añadir marketing Astramuses</b><small>Desde {formatMxPrice(PACKAGE_PRICING.monthly.astramusesStaticFrom)}/mes · servicio separado</small></span>
                <em><u /></em>
              </button>
            ) : null}

            {draft.plan === 'free' && freeSubmit.publicUrl ? (
              <button
                className="lmw-builder-primary"
                onClick={() => setPublicationOpen(true)}
                type="button"
              >
                Ver sitio publicado <span>↗</span>
              </button>
            ) : (
              <button className="lmw-builder-primary" onClick={() => setPreviewOpen(true)} type="button">
                Ver ejemplo <span>↗</span>
              </button>
            )}
          </aside>
        </main>
      ) : (
        <main className="lmw-package-summary">
          <section className="lmw-summary-main">
            <p className="lmw-builder-eyebrow">04 / Resumen</p>
            <h1>Tu paquete está listo para evaluación.</h1>
            <p>
              Éste es un borrador operativo. Todavía no genera un cobro, contrato o recurso de
              Cloudflare.
            </p>

            <div className={`lmw-summary-plan lmw-summary-plan--${draft.plan}`}>
              <div>
                <span>Plan elegido</span>
                <strong>{PLAN_COPY[draft.plan].name}</strong>
                <small>{getPackageLabel(draft.plan, draft.modules)}</small>
              </div>
              <i>{draft.plan === 'free' ? '○' : draft.plan === 'starter' ? '★' : '♢'}</i>
            </div>

            <section className="lmw-summary-pricing" aria-label="Estimación comercial">
              <article>
                <span>IMPLEMENTACIÓN INICIAL</span>
                <strong>{formatMxPrice(priceEstimate.implementation)}</strong>
                <p>{priceEstimate.implementationLabel}</p>
              </article>
              <article>
                <span>MANTENIMIENTO OPCIONAL</span>
                <strong>{draft.plan === 'free' ? 'No aplica' : `${formatMxPrice(priceEstimate.maintenanceFrom)}/mes`}</strong>
                <p>{draft.plan === 'free' ? 'El plan Free entra a cola automatizada.' : `Operación con agente desde ${formatMxPrice(priceEstimate.operationalMaintenanceFrom)}/mes.`}</p>
              </article>
              <article className={draft.marketing ? 'is-astra' : ''}>
                <span>ASTRAMUSES</span>
                <strong>{draft.marketing ? `${formatMxPrice(priceEstimate.astramusesMonthly)}/mes` : 'No incluido'}</strong>
                <p>{draft.marketing ? 'Contenido estático inicial. Video y automatización se cotizan aparte.' : 'Puede añadirse antes de pagar.'}</p>
              </article>
            </section>

            <div className="lmw-summary-grid">
              <article>
                <span>ALCANCE</span>
                <h2>{draft.plan === 'free' ? 'Página informativa' : `${selectedModules.length} capacidades`}</h2>
                <ul>
                  {draft.plan === 'free' ? <li>Página única en subdominio LMWares</li> : null}
                  {selectedModules.map((module) => <li key={module.id}>{module.name}</li>)}
                </ul>
              </article>
              <article>
                <span>PUBLICACIÓN</span>
                <h2>
                  {draft.plan === 'free'
                    ? `${normalizeFreeSlug(freeForm.slug) || 'tu-negocio'}.lmwares.com`
                    : 'Subdominio primero'}
                </h2>
                <p>
                  {draft.plan === 'free'
                    ? `${draft.images.length}/${FREE_IMAGE_LIMIT} imágenes preparadas.`
                    : 'El proyecto se publica primero en LMWares; después puede migrarse a un dominio personalizado.'}
                </p>
              </article>
              <article className={draft.marketing ? 'is-astra' : ''}>
                <span>MARKETING</span>
                <h2>{draft.marketing ? 'Astramuses añadido' : 'No incluido'}</h2>
                <p>{draft.marketing ? 'Se evaluará como servicio separado.' : 'Puedes añadirlo antes de enviar.'}</p>
              </article>
            </div>

            {draft.plan === 'free' ? (
              <>
                <section className="lmw-summary-consent" aria-labelledby="free-publication-consent">
                  <label>
                    <input
                      checked={freeForm.termsAccepted}
                      onChange={(event) => {
                        updateFreeForm({ termsAccepted: event.target.checked });
                        if (event.target.checked) setFileError('');
                      }}
                      type="checkbox"
                    />
                    <span>
                      <strong id="free-publication-consent">Autorización final de publicación</strong>
                      Acepto que LMWares use la información e imágenes enviadas para generar y
                      publicar esta página informativa Free.
                    </span>
                  </label>
                  <small>
                    El ejemplo no necesita autorización. Esta casilla corresponde únicamente a tu
                    solicitud real.
                  </small>
                </section>
                <section className="lmw-summary-turnstile" aria-labelledby="free-turnstile-label">
                  <div>
                    <strong id="free-turnstile-label">Verificación anti-spam</strong>
                    <span>Protege la cola Free antes de crear la solicitud.</span>
                  </div>
                  <Turnstile
                    action="turnstile-spin-v1"
                    key={turnstileAttempt}
                    onToken={setTurnstileToken}
                    siteKey={config.turnstileSiteKey}
                  />
                </section>
              </>
            ) : null}

            {fileError ? (
              <p className="lmw-summary-error" role="alert">{fileError}</p>
            ) : null}

            <div className="lmw-summary-actions">
              <button onClick={() => setView('package')} type="button">← Volver a configurar</button>
              <button className="lmw-builder-primary" disabled={submitting || submitted} onClick={submitDraft} type="button">
                {submitted
                  ? 'Solicitud enviada'
                  : submitting ? 'Enviando...' : draft.plan === 'free' ? 'Enviar solicitud Free' : 'Enviar para revisión'} <span>{submitted ? '✓' : '→'}</span>
              </button>
            </div>
          </section>

          <aside className="lmw-summary-next">
            <p className="lmw-builder-eyebrow">Qué ocurre después</p>
            <ol>
              <li><span>01</span><div><b>Revisamos la combinación</b><p>Confirmamos dependencias y evitamos capacidad innecesaria.</p></div></li>
              <li><span>02</span><div><b>Fijamos el alcance</b><p>Contenido, límites, dominio, tiempos y acompañamiento.</p></div></li>
              <li><span>03</span><div><b>Preparamos la propuesta</b><p>Separando implementación, licencia, alojamiento y mantenimiento.</p></div></li>
            </ol>
            <div><i />{draft.plan === 'free' ? 'Free envía una solicitud real a la cola automatizada.' : 'El alcance original queda congelado para revisión humana. No se habilita ningún cobro todavía.'}</div>
          </aside>
        </main>
      )}

      <PackagePreviewModal
        draft={draft}
        onClose={() => setPreviewOpen(false)}
        onContinue={() => {
          setPreviewOpen(false);
          setView('summary');
        }}
        open={previewOpen}
      />
      <FreePublicationModal
        message={freeSubmit.message}
        onClose={() => setPublicationOpen(false)}
        open={publicationOpen}
        publicUrl={freeSubmit.publicUrl}
        slug={freeSubmit.slug}
        status={freeSubmit.status}
      />
      <AccountCenterModal
        error={accountError}
        initialTab={accountTab}
        loading={accountLoading}
        onClose={() => setAccountOpen(false)}
        onAcceptOffer={acceptCommercialOffer}
        onMarkAllRead={markAllAccountNotificationsRead}
        onMarkRead={markAccountNotificationRead}
        onReload={loadAccount}
        onSignOut={signOut}
        open={accountOpen}
        overview={accountOverview}
      />
    </div>
  );
}

function loadCommercialSubmissionKey(): string {
  const stored = localStorage.getItem(COMMERCIAL_SUBMISSION_KEY_STORAGE);
  if (stored && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(stored)) {
    return stored;
  }
  const created = crypto.randomUUID();
  localStorage.setItem(COMMERCIAL_SUBMISSION_KEY_STORAGE, created);
  return created;
}

function normalizeFreeSlug(value: string) {
  return value
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function parseLocationCoordinates(latitudeValue: string, longitudeValue: string) {
  if (!latitudeValue.trim() || !longitudeValue.trim()) return null;
  const latitude = Number(latitudeValue);
  const longitude = Number(longitudeValue);
  if (
    !Number.isFinite(latitude)
    || !Number.isFinite(longitude)
    || latitude < -90
    || latitude > 90
    || longitude < -180
    || longitude > 180
  ) {
    return null;
  }
  return { latitude, longitude };
}

function parseFreeLines(value: string) {
  const seen = new Set<string>();
  return value
    .split(/\r?\n|,/)
    .map((item) => item.trim())
    .filter(Boolean)
    .filter((item) => {
      const key = item.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 8);
}

function userInitials(user: PublicUser) {
  return (user.name ?? user.email)
    .split(/[\s@._-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('');
}

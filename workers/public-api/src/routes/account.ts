import { Hono } from 'hono';
import {
  AppError,
  type ClientCustomDomain,
  type FreeIntake,
  type Metadata,
} from '@starter/domain';
import { createRepositories, type LmwaresNotification } from '@starter/db';
import type { Bindings, Variables } from '../env';
import { publicCommercialOffer } from '../lib/commercial-offer-public';
import { publicBillingOrder } from '../lib/billing-order-public';
import { publicMaintenanceSubscription } from '../lib/maintenance-subscription-public';
import {
  assertTrustedPublicOrigin,
  requirePublicSession,
} from '../middleware/public-auth';

export const account = new Hono<{ Bindings: Bindings; Variables: Variables }>();

account.use('*', async (c, next) => {
  await requirePublicSession(c);
  await next();
});

account.get('/', async (c) => {
  const user = c.get('publicUser');
  const repos = createRepositories(c.env.DB);
  const [
    notifications,
    intakes,
    commercialIntakes,
    currentOffers,
    billingOrders,
    workOrders,
    clientProjects,
    customDomains,
    maintenanceSubscriptions,
    demoLifecycles,
  ] = await Promise.all([
    repos.lmwaresNotifications.listForUser(user.id),
    repos.lmwaresFreeIntakes.listForUser(user.id),
    repos.lmwaresPackageIntakes.listForUser(user.id),
    repos.lmwaresCommercialOffers.listCurrentForUser(user.id),
    repos.lmwaresBillingOrders.listForUser(user.id),
    repos.lmwaresStarterWorkOrders.listForUser(user.id),
    repos.lmwaresStarterClientProjects.listForUser(user.id),
    repos.lmwaresCustomDomains.listForUser(user.id),
    repos.lmwaresMaintenanceSubscriptions.listForUser(user.id),
    repos.lmwaresCommercialDemoLifecycles.listForUser(user.id),
  ]);
  const demoPhasesByLifecycle = new Map(
    await Promise.all(demoLifecycles.map(async (lifecycle) => [
      lifecycle.id,
      await repos.lmwaresCommercialDemoLifecycles.listPhases(lifecycle.id),
    ] as const)),
  );
  const demosByIntake = new Map(demoLifecycles.map((lifecycle) => [lifecycle.intakeId, lifecycle]));
  const scopeStates = new Map(await Promise.all(commercialIntakes
    .filter(intake => ['submitted', 'scope_review'].includes(intake.status))
    .map(async intake => {
      const job = await repos.lmwaresCommercialAgentJobs.getForIntake(intake.id, 'scope');
      const exhausted = job?.status === 'claimed' && job.attempt >= job.maxAttempts && job.leaseUntil && job.leaseUntil < new Date().toISOString();
      return [intake.id, !job || job.status === 'failed' || exhausted ? 'review_required' : 'preparing'] as const;
    })));
  const offersByIntake = new Map(currentOffers.map((offer) => [offer.intakeId, offer]));
  const ordersByOffer = new Map<string, typeof billingOrders>();
  for (const order of billingOrders) {
    if (!order.commercialOfferId) continue;
    const bucket = ordersByOffer.get(order.commercialOfferId) ?? [];
    bucket.push(order);
    ordersByOffer.set(order.commercialOfferId, bucket);
  }
  const workOrdersByIntake = new Map(workOrders.map((workOrder) => [workOrder.intakeId, workOrder]));
  const clientProjectsByWorkOrder = new Map(
    clientProjects.map((clientProject) => [clientProject.workOrderId, clientProject]),
  );
  const customDomainsByProject = new Map<string, ClientCustomDomain[]>();
  for (const domain of customDomains) {
    const bucket = customDomainsByProject.get(domain.clientProjectId) ?? [];
    bucket.push(domain);
    customDomainsByProject.set(domain.clientProjectId, bucket);
  }
  const maintenanceByWorkOrder = new Map(
    maintenanceSubscriptions.map((subscription) => [subscription.workOrderId, subscription]),
  );

  return c.json({
    user,
    unreadCount: notifications.filter(({ readAt }) => !readAt).length,
    notifications: notifications.map(toAccountNotification),
    sites: intakes.map(toAccountSite),
    commercialIntakes: commercialIntakes.map((intake) => ({
      id: intake.id,
      brief: intake.brief,
      scopeAutomation: scopeStates.get(intake.id) ?? null,
      discountCode: intake.discountCode,
      discountPercent: intake.discountPercent,
      plan: intake.plan,
      modules: intake.modules,
      marketing: intake.marketing,
      status: intake.status,
      estimatedImplementationCents: intake.estimatedImplementationCents,
      estimatedMonthlyCents: intake.estimatedMonthlyCents,
      currency: intake.currency,
      pricingVersion: intake.pricingVersion,
      maintenanceStartPolicy: intake.maintenanceStartPolicy,
      proposalId: intake.proposalId,
      currentOffer: offersByIntake.has(intake.id)
        ? publicCommercialOffer(offersByIntake.get(intake.id)!)
        : null,
      implementationPhases: (offersByIntake.has(intake.id)
        ? ordersByOffer.get(offersByIntake.get(intake.id)!.id) ?? []
        : []
      )
        .slice()
        .sort((a, b) => a.phase - b.phase)
        .map(publicBillingOrder),
      workOrder: workOrdersByIntake.has(intake.id)
        ? publicWorkOrder(workOrdersByIntake.get(intake.id)!)
        : null,
      clientProject:
        workOrdersByIntake.has(intake.id) &&
        clientProjectsByWorkOrder.has(workOrdersByIntake.get(intake.id)!.id)
          ? publicStarterClientProject(
              clientProjectsByWorkOrder.get(workOrdersByIntake.get(intake.id)!.id)!,
              customDomainsByProject.get(
                clientProjectsByWorkOrder.get(workOrdersByIntake.get(intake.id)!.id)!.id,
              ) ?? [],
            )
          : null,
      maintenanceSubscription:
        workOrdersByIntake.has(intake.id) &&
        maintenanceByWorkOrder.has(workOrdersByIntake.get(intake.id)!.id)
          ? publicMaintenanceSubscription(
              maintenanceByWorkOrder.get(workOrdersByIntake.get(intake.id)!.id)!,
            )
          : null,
      demo: demosByIntake.has(intake.id)
        ? publicDemoLifecycle(demosByIntake.get(intake.id)!)
        : null,
      demoPhases: demosByIntake.has(intake.id)
        ? (demoPhasesByLifecycle.get(demosByIntake.get(intake.id)!.id) ?? []).map(publicDemoPhase)
        : [],
      submittedAt: intake.submittedAt,
      updatedAt: intake.updatedAt,
    })),
  });
});

function publicDemoLifecycle(lifecycle: {
  id: string; slug: string; siteName: string; status: string; demoPublishedAt: string | null;
  phaseZeroCompletedAt: string | null; createdAt: string; updatedAt: string;
}) {
  return { id: lifecycle.id, slug: lifecycle.slug, siteName: lifecycle.siteName, status: lifecycle.status, demoPublishedAt: lifecycle.demoPublishedAt, phaseZeroCompletedAt: lifecycle.phaseZeroCompletedAt, createdAt: lifecycle.createdAt, updatedAt: lifecycle.updatedAt };
}

function publicDemoPhase(phase: {
  id: string; phase: number; status: string; evidence: string | null; startedAt: string | null;
  completedAt: string | null; updatedAt: string;
}) {
  return { id: phase.id, phase: phase.phase, status: phase.status, evidence: phase.evidence, startedAt: phase.startedAt, completedAt: phase.completedAt, updatedAt: phase.updatedAt };
}

account.patch('/notifications/read-all', async (c) => {
  assertTrustedPublicOrigin(c);
  const user = c.get('publicUser');
  const updated = await createRepositories(c.env.DB).lmwaresNotifications.markAllRead(user.id);
  return c.json({ updated });
});

account.patch('/notifications/:id/read', async (c) => {
  assertTrustedPublicOrigin(c);
  const user = c.get('publicUser');
  const notification = await createRepositories(c.env.DB).lmwaresNotifications.markRead(
    c.req.param('id'),
    user.id,
  );
  // 404 evita revelar si el id pertenece a otra cuenta.
  if (!notification) throw AppError.notFound('Notificación');
  return c.json({ notification: toAccountNotification(notification) });
});

function toAccountNotification(notification: LmwaresNotification) {
  if (notification.template === 'starter-site-published') {
    const siteName = metadataString(notification.payload, 'siteName') ?? 'Tu sitio Starter';
    const publicUrl = safePublishedUrl(metadataString(notification.payload, 'publicUrl'));
    const monthlyAmountCents = metadataNumber(notification.payload, 'monthlyAmountCents') ?? 0;
    return {
      id: notification.id,
      kind: notification.template,
      title: 'Tu sitio Starter ya está publicado',
      summary: `${siteName} ya está en línea.`,
      body: [
        `Terminamos de publicar ${siteName}.`,
        monthlyAmountCents > 0
          ? `Tu mantenimiento de ${formatMoney(monthlyAmountCents)} al mes está activo desde esta publicación.`
          : 'Tu entrega fue contratada como pago único, sin mantenimiento mensual.',
        'Puedes conservar el enlace, copiarlo o abrir el sitio desde este mensaje.',
      ],
      plan: metadataString(notification.payload, 'plan') ?? 'starter',
      siteName,
      referenceId: metadataString(notification.payload, 'workOrderId'),
      actionUrl: publicUrl,
      actionLabel: publicUrl ? 'Abrir mi sitio' : null,
      deliveryStatus: notification.status,
      readAt: notification.readAt,
      sentAt: notification.sentAt,
      createdAt: notification.createdAt,
    };
  }
  if (notification.template === 'implementation-payment-confirmed') {
    const amount = metadataNumber(notification.payload, 'amountCents');
    return {
      id: notification.id,
      kind: notification.template,
      title: 'Pago de implementación confirmado',
      summary: amount == null ? 'Tu proyecto ya puede comenzar.' : `${formatMoney(amount)} recibidos.`,
      body: [
        'Mercado Pago confirmó tu pago de implementación.',
        'Tu solicitud ya quedó registrada como trabajo contratado y comenzaremos la preparación del proyecto.',
        'Si tu oferta incluye mantenimiento, se autorizará por separado cuando el sitio esté listo para publicarse.',
      ],
      plan: 'starter',
      siteName: 'Implementación LMWares',
      referenceId: metadataString(notification.payload, 'billingOrderId'),
      actionUrl: null,
      actionLabel: null,
      deliveryStatus: notification.status,
      readAt: notification.readAt,
      sentAt: notification.sentAt,
      createdAt: notification.createdAt,
    };
  }
  if (notification.template === 'commercial-offer-issued') {
    const plan = metadataString(notification.payload, 'plan') ?? 'starter';
    const version = metadataNumber(notification.payload, 'version');
    const implementation = metadataNumber(notification.payload, 'implementationAmountCents');
    const monthly = metadataNumber(notification.payload, 'monthlyAmountCents');
    return {
      id: notification.id,
      kind: notification.template,
      title: 'Tu oferta LMWares está lista',
      summary: `Oferta ${plan} v${version ?? 1} lista para revisar.`,
      body: [
        `Preparamos la versión ${version ?? 1} de tu oferta ${plan}.`,
        implementation == null
          ? 'Los importes finales están disponibles en Mis sitios.'
          : `Implementación: ${formatMoney(implementation)}. Mensualidad al publicar: ${formatMoney(monthly ?? 0)}.`,
        'Revísala en Mis sitios. No realizaremos ningún cobro hasta que la aceptes.',
      ],
      plan,
      siteName: `Oferta ${plan}`,
      referenceId: metadataString(notification.payload, 'offerId'),
      actionUrl: null,
      actionLabel: null,
      deliveryStatus: notification.status,
      readAt: notification.readAt,
      sentAt: notification.sentAt,
      createdAt: notification.createdAt,
    };
  }
  const siteName = metadataString(notification.payload, 'siteName') ?? 'Tu página';
  const publicUrl = safePublishedUrl(metadataString(notification.payload, 'publicUrl'));
  const plan = metadataString(notification.payload, 'plan') ?? 'free';
  const referenceId = notification.intakeId ?? metadataString(notification.payload, 'intakeId');
  const deliveryMessage =
    notification.status === 'sent'
      ? 'También enviamos el comprobante a tu correo.'
      : notification.status === 'failed'
        ? 'Tu página está disponible aquí. El correo no pudo entregarse; puedes contactar a soporte.'
        : 'Tu comprobante por correo está en proceso de envío.';

  return {
    id: notification.id,
    kind: notification.template,
    title: '¡Gracias por probar LMWares!',
    summary: `${siteName} ya está publicada.`,
    body: [
      `Terminamos de generar y publicar ${siteName}.`,
      deliveryMessage,
      'Puedes conservar el enlace, copiarlo o abrir tu sitio desde este mensaje.',
    ],
    plan,
    siteName,
    referenceId,
    actionUrl: publicUrl,
    actionLabel: publicUrl ? 'Abrir mi sitio' : null,
    deliveryStatus: notification.status,
    readAt: notification.readAt,
    sentAt: notification.sentAt,
    createdAt: notification.createdAt,
  };
}

function metadataNumber(payload: Metadata, key: string): number | null {
  const value = payload[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function publicWorkOrder(workOrder: {
  id: string;
  status: string;
  publishedUrl: string | null;
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
}) {
  return {
    id: workOrder.id,
    status: workOrder.status,
    publishedUrl: safePublishedUrl(workOrder.publishedUrl),
    publishedAt: workOrder.publishedAt,
    createdAt: workOrder.createdAt,
    updatedAt: workOrder.updatedAt,
  };
}

function publicStarterClientProject(clientProject: {
  id: string;
  slug: string;
  siteName: string;
  status: string;
  createdAt: string;
  updatedAt: string;
}, domains: ClientCustomDomain[] = []) {
  return {
    id: clientProject.id,
    slug: clientProject.slug,
    siteName: clientProject.siteName,
    status: clientProject.status,
    createdAt: clientProject.createdAt,
    updatedAt: clientProject.updatedAt,
    customDomains: domains.map(publicCustomDomain),
  };
}

function publicCustomDomain(domain: ClientCustomDomain) {
  return {
    id: domain.id,
    clientProjectId: domain.clientProjectId,
    hostname: domain.hostname,
    type: domain.type,
    status: domain.status,
    verificationMethod: domain.verificationMethod,
    dnsInstructions: domain.dnsInstructions,
    provider: domain.provider,
    certificateStatus: domain.certificateStatus,
    lastError: domain.lastError,
    verifiedAt: domain.verifiedAt,
    activatedAt: domain.activatedAt,
    removedAt: domain.removedAt,
    createdAt: domain.createdAt,
    updatedAt: domain.updatedAt,
  };
}

function formatMoney(cents: number): string {
  return new Intl.NumberFormat('es-MX', {
    style: 'currency',
    currency: 'MXN',
    maximumFractionDigits: 0,
  }).format(cents / 100);
}

function toAccountSite(intake: FreeIntake) {
  return {
    id: intake.id,
    slug: intake.slug,
    siteName: intake.siteName,
    plan: 'free' as const,
    status: intake.status,
    publicUrl: safePublishedUrl(intake.publishedUrl),
    createdAt: intake.createdAt,
    submittedAt: intake.submittedAt,
    publishedAt: intake.publishedAt,
    updatedAt: intake.updatedAt,
  };
}

function metadataString(payload: Metadata, key: string): string | null {
  const value = payload[key];
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function safePublishedUrl(value: string | null): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && url.hostname.endsWith('.lmwares.com')
      ? url.toString()
      : null;
  } catch {
    return null;
  }
}

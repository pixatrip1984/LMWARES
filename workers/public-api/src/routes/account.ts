import { Hono } from 'hono';
import { AppError, type FreeIntake, type Metadata } from '@starter/domain';
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
    maintenanceSubscriptions,
  ] = await Promise.all([
    repos.lmwaresNotifications.listForUser(user.id),
    repos.lmwaresFreeIntakes.listForUser(user.id),
    repos.lmwaresPackageIntakes.listForUser(user.id),
    repos.lmwaresCommercialOffers.listCurrentForUser(user.id),
    repos.lmwaresBillingOrders.listForUser(user.id),
    repos.lmwaresStarterWorkOrders.listForUser(user.id),
    repos.lmwaresMaintenanceSubscriptions.listForUser(user.id),
  ]);
  const offersByIntake = new Map(currentOffers.map((offer) => [offer.intakeId, offer]));
  const ordersByOffer = new Map(
    billingOrders
      .filter((order) => order.commercialOfferId)
      .map((order) => [order.commercialOfferId!, order]),
  );
  const workOrdersByIntake = new Map(workOrders.map((workOrder) => [workOrder.intakeId, workOrder]));
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
      implementationPayment:
        offersByIntake.has(intake.id) && ordersByOffer.has(offersByIntake.get(intake.id)!.id)
          ? publicBillingOrder(ordersByOffer.get(offersByIntake.get(intake.id)!.id)!)
          : null,
      workOrder: workOrdersByIntake.has(intake.id)
        ? publicWorkOrder(workOrdersByIntake.get(intake.id)!)
        : null,
      maintenanceSubscription:
        workOrdersByIntake.has(intake.id) &&
        maintenanceByWorkOrder.has(workOrdersByIntake.get(intake.id)!.id)
          ? publicMaintenanceSubscription(
              maintenanceByWorkOrder.get(workOrdersByIntake.get(intake.id)!.id)!,
            )
          : null,
      submittedAt: intake.submittedAt,
      updatedAt: intake.updatedAt,
    })),
  });
});

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
    return {
      id: notification.id,
      kind: notification.template,
      title: 'Tu sitio Starter ya está publicado',
      summary: `${siteName} ya está en línea.`,
      body: [
        `Terminamos de publicar ${siteName}.`,
        'Tu mensualidad de mantenimiento está activa desde esta publicación.',
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
        'La mensualidad se autorizará por separado cuando el sitio esté listo para publicarse.',
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

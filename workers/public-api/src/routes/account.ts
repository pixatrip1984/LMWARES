import { Hono } from 'hono';
import { AppError, type FreeIntake, type Metadata } from '@starter/domain';
import { createRepositories, type LmwaresNotification } from '@starter/db';
import type { Bindings, Variables } from '../env';
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
  const [notifications, intakes, commercialIntakes] = await Promise.all([
    repos.lmwaresNotifications.listForUser(user.id),
    repos.lmwaresFreeIntakes.listForUser(user.id),
    repos.lmwaresPackageIntakes.listForUser(user.id),
  ]);

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
      maintenanceStartPolicy: intake.maintenanceStartPolicy,
      proposalId: intake.proposalId,
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

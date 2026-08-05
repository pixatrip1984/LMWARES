import { AppError } from '@starter/domain';

export interface StarterPublishedEmailInput {
  siteName: string;
  publicUrl: string;
  workOrderId: string;
  intakeId: string;
  projectId: string;
  billingOrderId: string;
  commercialOfferId: string;
  maintenanceSubscriptionId: string | null;
  monthlyAmountCents: number;
  notificationId: string;
  recipientEmail: string;
  publishedAt: string;
  supportEmail: string;
  accountUrl: string;
}

export function buildStarterPublishedEmail(input: StarterPublishedEmailInput) {
  const siteName = cleanText(input.siteName, 120) || 'Tu sitio Starter';
  const publicUrl = validateHttpsUrl(input.publicUrl, true);
  const accountUrl = validateHttpsUrl(input.accountUrl, false);
  const workOrderId = cleanIdentifier(input.workOrderId);
  const intakeId = cleanIdentifier(input.intakeId);
  const projectId = cleanIdentifier(input.projectId);
  const billingOrderId = cleanIdentifier(input.billingOrderId);
  const commercialOfferId = cleanIdentifier(input.commercialOfferId);
  const maintenanceSubscriptionId = input.maintenanceSubscriptionId
    ? cleanIdentifier(input.maintenanceSubscriptionId)
    : null;
  const notificationId = cleanIdentifier(input.notificationId);
  const recipientEmail = cleanEmail(input.recipientEmail);
  const supportEmail = cleanEmail(input.supportEmail);
  const publishedAt = formatPublishedAt(input.publishedAt);
  const monthlyAmount = formatMoney(input.monthlyAmountCents);
  const safe = {
    siteName: escapeHtml(siteName),
    publicUrl: escapeHtml(publicUrl),
    accountUrl: escapeHtml(accountUrl),
    workOrderId: escapeHtml(workOrderId),
    intakeId: escapeHtml(intakeId),
    projectId: escapeHtml(projectId),
    billingOrderId: escapeHtml(billingOrderId),
    commercialOfferId: escapeHtml(commercialOfferId),
    maintenanceSubscriptionId: maintenanceSubscriptionId ? escapeHtml(maintenanceSubscriptionId) : null,
    notificationId: escapeHtml(notificationId),
    recipientEmail: escapeHtml(recipientEmail),
    supportEmail: escapeHtml(supportEmail),
    publishedAt: escapeHtml(publishedAt),
    monthlyAmount: escapeHtml(monthlyAmount),
  };

  const references = [
    `Orden de trabajo: ${workOrderId}`,
    `Solicitud: ${intakeId}`,
    `Proyecto: ${projectId}`,
    `Pago de implementación: ${billingOrderId}`,
    `Oferta: ${commercialOfferId}`,
    ...(maintenanceSubscriptionId ? [`Suscripción de mantenimiento: ${maintenanceSubscriptionId}`] : []),
    `Notificación: ${notificationId}`,
  ];

  return {
    subject: `${siteName} ya está publicado · LMWares`,
    text: [
      'Hola,',
      '',
      `Tu sitio Starter ${siteName} ya está publicado:`,
      publicUrl,
      '',
      input.monthlyAmountCents > 0
        ? `Mantenimiento mensual autorizado: ${monthlyAmount}`
        : 'Mantenimiento mensual: no contratado',
      `Publicado: ${publishedAt}`,
      `Cuenta: ${recipientEmail}`,
      ...references,
      '',
      `Puedes consultar el sitio y el estado del servicio en ${accountUrl}.`,
      input.monthlyAmountCents > 0
        ? `Para solicitar cambios, soporte o cancelación de cobros futuros, responde a este correo o escribe a ${supportEmail} desde la cuenta contratante. La cancelación detiene renovaciones futuras; no elimina automáticamente el sitio ni sustituye solicitudes de reembolso ya causadas.`
        : `Esta entrega no tiene mantenimiento mensual contratado. Para solicitar cambios o soporte, responde a este correo o escribe a ${supportEmail}.`,
      '',
      'LMWares',
    ].join('\n'),
    html: `<!doctype html>
<html lang="es"><body style="margin:0;background:#f3f6fa;color:#122033;font-family:Arial,sans-serif">
  <div style="max-width:660px;margin:0 auto;padding:40px 20px">
    <div style="background:#071b33;color:#fff;padding:22px 26px;font-weight:800;letter-spacing:.04em">LMWARES</div>
    <div style="background:#fff;padding:34px 26px;border:1px solid #dce4ee">
      <p style="margin:0 0 12px;color:#55708f;font-size:12px;font-weight:800;letter-spacing:.12em;text-transform:uppercase">Starter publicado</p>
      <h1 style="margin:0 0 16px;font-size:28px;line-height:1.2">${safe.siteName} ya está en línea</h1>
      <p style="margin:0 0 24px;line-height:1.6">Terminamos la publicación inicial de tu proyecto Starter.</p>
      <a href="${safe.publicUrl}" style="display:inline-block;background:#1268e8;color:#fff;text-decoration:none;padding:14px 20px;font-weight:800">Abrir mi sitio</a>
      <p style="margin:22px 0 0;color:#55708f;font-size:13px;word-break:break-all">${safe.publicUrl}</p>
      <div style="margin-top:28px;padding:20px;background:#f3f7fc;border-left:3px solid #1268e8">
        <p style="margin:0 0 12px;color:#55708f;font-size:11px;font-weight:800;letter-spacing:.1em;text-transform:uppercase">Datos del servicio</p>
        <table role="presentation" style="border-collapse:collapse;width:100%;font-size:13px;line-height:1.55">
          <tr><td style="padding:4px 12px 4px 0;color:#55708f">Plan</td><td style="padding:4px 0;font-weight:700">Starter</td></tr>
          <tr><td style="padding:4px 12px 4px 0;color:#55708f">Mantenimiento</td><td style="padding:4px 0;font-weight:700">${input.monthlyAmountCents > 0 ? `${safe.monthlyAmount} al mes` : 'No contratado'}</td></tr>
          <tr><td style="padding:4px 12px 4px 0;color:#55708f">Publicada</td><td style="padding:4px 0">${safe.publishedAt}</td></tr>
          <tr><td style="padding:4px 12px 4px 0;color:#55708f">Cuenta</td><td style="padding:4px 0">${safe.recipientEmail}</td></tr>
          ${referenceRow('Orden de trabajo', safe.workOrderId)}
          ${referenceRow('Solicitud', safe.intakeId)}
          ${referenceRow('Proyecto', safe.projectId)}
          ${referenceRow('Pago de implementación', safe.billingOrderId)}
          ${referenceRow('Oferta', safe.commercialOfferId)}
          ${safe.maintenanceSubscriptionId ? referenceRow('Suscripción', safe.maintenanceSubscriptionId) : ''}
          ${referenceRow('Notificación', safe.notificationId)}
        </table>
      </div>
      <p style="margin:24px 0 0;color:#55708f;font-size:13px;line-height:1.65">
        ${input.monthlyAmountCents > 0 ? 'Para cambios, soporte o cancelación de cobros futuros' : 'Para solicitar cambios o soporte'}, responde a este mensaje o escribe a
        <a href="mailto:${safe.supportEmail}" style="color:#1268e8">${safe.supportEmail}</a> desde la cuenta contratante.
        ${input.monthlyAmountCents > 0 ? 'La cancelación detiene renovaciones futuras; no elimina automáticamente el sitio ni sustituye solicitudes de reembolso ya causadas.' : 'Esta entrega no genera renovaciones ni cobros mensuales.'}
      </p>
      <p style="margin:14px 0 0"><a href="${safe.accountUrl}" style="color:#1268e8">Abrir mi cuenta LMWares</a></p>
    </div>
  </div>
</body></html>`,
  };
}

function cleanText(value: string, maxLength: number): string {
  return value.replace(/[\r\n]+/g, ' ').trim().slice(0, maxLength);
}

function cleanIdentifier(value: string): string {
  const cleaned = value.replace(/[\r\n]+/g, '').trim().slice(0, 120);
  if (!cleaned) throw new AppError('validation_error', 'Falta una referencia de publicación.');
  return cleaned;
}

function cleanEmail(value: string): string {
  const cleaned = value.replace(/[\r\n]+/g, '').trim().toLowerCase().slice(0, 254);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleaned)) {
    throw new AppError('validation_error', 'La notificación no contiene un correo válido.');
  }
  return cleaned;
}

function formatMoney(amountCents: number): string {
  if (!Number.isSafeInteger(amountCents) || amountCents < 0) {
    throw new AppError('validation_error', 'La mensualidad de la notificación no es válida.');
  }
  return new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' })
    .format(amountCents / 100);
}

function formatPublishedAt(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new AppError('validation_error', 'La notificación no contiene una fecha válida.');
  }
  return new Intl.DateTimeFormat('es-MX', {
    dateStyle: 'long',
    timeStyle: 'short',
    timeZone: 'America/Mexico_City',
  }).format(date);
}

function validateHttpsUrl(value: string, requireLmwares: boolean): string {
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || !url.hostname) throw new Error('invalid');
    if (requireLmwares && !url.hostname.toLowerCase().endsWith('.lmwares.com')) {
      throw new Error('invalid');
    }
    return url.toString();
  } catch {
    throw new AppError('validation_error', 'La notificación no contiene una URL publicada válida.');
  }
}

function referenceRow(label: string, value: string): string {
  return `<tr><td style="padding:4px 12px 4px 0;color:#55708f">${label}</td><td style="padding:4px 0;font-family:monospace;word-break:break-all">${value}</td></tr>`;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

import { AppError } from '@starter/domain';

export interface FreePublishedEmailInput {
  siteName: string;
  publicUrl: string;
  referenceId: string;
  notificationId: string;
  recipientEmail: string;
  publishedAt: string;
  supportEmail: string;
}

export function buildFreePublishedEmail(input: FreePublishedEmailInput) {
  const siteName = input.siteName.replace(/[\r\n]+/g, ' ').trim().slice(0, 120);
  const publicUrl = validatePublishedUrl(input.publicUrl);
  const referenceId = cleanIdentifier(input.referenceId);
  const notificationId = cleanIdentifier(input.notificationId);
  const recipientEmail = cleanEmail(input.recipientEmail);
  const supportEmail = cleanEmail(input.supportEmail);
  const publishedAt = formatPublishedAt(input.publishedAt);
  const safeName = escapeHtml(siteName || 'Tu página');
  const safeUrl = escapeHtml(publicUrl);
  const safeReferenceId = escapeHtml(referenceId);
  const safeNotificationId = escapeHtml(notificationId);
  const safeRecipientEmail = escapeHtml(recipientEmail);
  const safeSupportEmail = escapeHtml(supportEmail);
  const safePublishedAt = escapeHtml(publishedAt);

  return {
    subject: `${siteName || 'Tu página'} ya está publicada · LMWares`,
    text: [
      `Hola,`,
      ``,
      `¡Gracias por probar LMWares!`,
      `${siteName || 'Tu página'} ya está publicada en el plan Free.`,
      `Puedes abrirla aquí: ${publicUrl}`,
      ``,
      `Datos de la entrega`,
      `Plan: Free`,
      `Referencia: ${referenceId}`,
      `Notificación: ${notificationId}`,
      `Publicada: ${publishedAt}`,
      `Cuenta: ${recipientEmail}`,
      ``,
      `El plan Free no crea una suscripción ni genera cobros recurrentes. Si quieres corregir o retirar la página, responde a este correo o escribe a ${supportEmail} desde la cuenta con la que la solicitaste.`,
      ``,
      `También encontrarás este mensaje y la URL en el centro de cuenta de LMWares.`,
      ``,
      `LMWares`,
    ].join('\n'),
    html: `<!doctype html>
<html lang="es">
  <body style="margin:0;background:#f3f6fa;color:#122033;font-family:Arial,sans-serif">
    <div style="max-width:620px;margin:0 auto;padding:40px 20px">
      <div style="background:#071b33;color:#fff;padding:22px 26px;font-weight:800;letter-spacing:.04em">
        LMWARES
      </div>
      <div style="background:#fff;padding:34px 26px;border:1px solid #dce4ee">
        <p style="margin:0 0 12px;color:#55708f;font-size:12px;font-weight:800;letter-spacing:.12em;text-transform:uppercase">
          Página Free publicada
        </p>
        <h1 style="margin:0 0 16px;font-size:28px;line-height:1.2">¡Gracias por probar LMWares!</h1>
        <p style="margin:0 0 24px;line-height:1.6">
          Terminamos de generar y publicar <strong>${safeName}</strong>. Tu página informativa Free ya está en línea.
        </p>
        <a href="${safeUrl}" style="display:inline-block;background:#1268e8;color:#fff;text-decoration:none;padding:14px 20px;font-weight:800">
          Abrir mi página
        </a>
        <p style="margin:24px 0 0;color:#55708f;font-size:13px;line-height:1.6;word-break:break-all">
          ${safeUrl}
        </p>
        <div style="margin-top:28px;padding:20px;background:#f3f7fc;border-left:3px solid #1268e8">
          <p style="margin:0 0 12px;color:#55708f;font-size:11px;font-weight:800;letter-spacing:.1em;text-transform:uppercase">
            Datos de la entrega
          </p>
          <table role="presentation" style="border-collapse:collapse;width:100%;font-size:13px;line-height:1.55">
            <tr><td style="padding:4px 12px 4px 0;color:#55708f">Plan</td><td style="padding:4px 0;font-weight:700">Free</td></tr>
            <tr><td style="padding:4px 12px 4px 0;color:#55708f">Referencia</td><td style="padding:4px 0;font-family:monospace;word-break:break-all">${safeReferenceId}</td></tr>
            <tr><td style="padding:4px 12px 4px 0;color:#55708f">Notificación</td><td style="padding:4px 0;font-family:monospace;word-break:break-all">${safeNotificationId}</td></tr>
            <tr><td style="padding:4px 12px 4px 0;color:#55708f">Publicada</td><td style="padding:4px 0">${safePublishedAt}</td></tr>
            <tr><td style="padding:4px 12px 4px 0;color:#55708f">Cuenta</td><td style="padding:4px 0">${safeRecipientEmail}</td></tr>
          </table>
        </div>
        <p style="margin:24px 0 0;color:#55708f;font-size:13px;line-height:1.65">
          El plan Free no crea una suscripción ni genera cobros recurrentes. Para corregir o retirar la página, responde a este mensaje o escribe a
          <a href="mailto:${safeSupportEmail}" style="color:#1268e8">${safeSupportEmail}</a>
          desde la cuenta con la que la solicitaste.
        </p>
        <p style="margin:14px 0 0;color:#55708f;font-size:13px;line-height:1.65">
          También encontrarás este comprobante y la URL dentro de tu centro de cuenta de LMWares.
        </p>
      </div>
    </div>
  </body>
</html>`,
  };
}

function cleanIdentifier(value: string): string {
  const cleaned = value.replace(/[\r\n]+/g, '').trim().slice(0, 120);
  if (!cleaned) {
    throw new AppError('validation_error', 'La notificación no contiene una referencia válida.');
  }
  return cleaned;
}

function cleanEmail(value: string): string {
  const cleaned = value.replace(/[\r\n]+/g, '').trim().toLowerCase().slice(0, 254);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleaned)) {
    throw new AppError('validation_error', 'La notificación no contiene un correo válido.');
  }
  return cleaned;
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

function validatePublishedUrl(value: string): string {
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || !url.hostname) throw new Error('invalid');
    return url.toString();
  } catch {
    throw new AppError('validation_error', 'La notificación no contiene una URL publicada válida.');
  }
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

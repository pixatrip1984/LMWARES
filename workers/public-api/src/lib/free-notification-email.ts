import { AppError } from '@starter/domain';

export interface FreePublishedEmailInput {
  siteName: string;
  publicUrl: string;
}

export function buildFreePublishedEmail(input: FreePublishedEmailInput) {
  const siteName = input.siteName.replace(/[\r\n]+/g, ' ').trim().slice(0, 120);
  const publicUrl = validatePublishedUrl(input.publicUrl);
  const safeName = escapeHtml(siteName || 'Tu página');
  const safeUrl = escapeHtml(publicUrl);

  return {
    subject: `${siteName || 'Tu página'} ya está publicada · LMWares`,
    text: [
      `Hola,`,
      ``,
      `${siteName || 'Tu página'} ya está publicada.`,
      `Puedes abrirla aquí: ${publicUrl}`,
      ``,
      `Conserva este enlace. Si necesitas reportar un problema, responde a este correo.`,
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
        <h1 style="margin:0 0 16px;font-size:28px;line-height:1.2">${safeName} ya está en línea.</h1>
        <p style="margin:0 0 24px;line-height:1.6">
          Terminamos de generar y publicar la página informativa solicitada desde tu cuenta.
        </p>
        <a href="${safeUrl}" style="display:inline-block;background:#1268e8;color:#fff;text-decoration:none;padding:14px 20px;font-weight:800">
          Abrir mi página
        </a>
        <p style="margin:24px 0 0;color:#55708f;font-size:13px;line-height:1.6;word-break:break-all">
          ${safeUrl}
        </p>
      </div>
    </div>
  </body>
</html>`,
  };
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

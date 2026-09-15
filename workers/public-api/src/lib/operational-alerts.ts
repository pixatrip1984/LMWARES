import type { Bindings } from '../env';

type OperationalAlert = { title: string; lines: string[] };

/** Best-effort operational delivery; a notification failure never reverses state. */
export async function notifyOperator(env: Bindings, alert: OperationalAlert): Promise<void> {
  const text = [alert.title, ...alert.lines.filter(Boolean)].join('\n');
  const deliveries: Promise<unknown>[] = [];
  const telegramChatId = env.TELEGRAM_ADMIN_CHAT_ID?.trim() || env.TELEGRAM_CHAT_ID?.trim();
  if (['1', 'true'].includes(env.TELEGRAM_NOTIFICATIONS_ENABLED?.trim().toLowerCase() ?? '') && env.TELEGRAM_BOT_TOKEN && telegramChatId) {
    deliveries.push(sendTelegram(env.TELEGRAM_BOT_TOKEN, telegramChatId, text));
  }
  if (env.ADMIN_ALERT_EMAIL?.trim()) {
    deliveries.push(Promise.resolve().then(() => env.EMAIL.send({ to: env.ADMIN_ALERT_EMAIL!.trim(), from: { email: env.EMAIL_FROM, name: 'LMWares' }, replyTo: env.EMAIL_REPLY_TO, subject: alert.title, text, html: `<h1>${escapeHtml(alert.title)}</h1>${alert.lines.map((line) => `<p>${escapeHtml(line)}</p>`).join('')}` })));
  }
  const results = await Promise.allSettled(deliveries);
  for (const result of results) if (result.status === 'rejected') console.warn('lmwares_operational_alert_failed', { message: result.reason instanceof Error ? result.reason.message : 'unknown' });
}

async function sendTelegram(token: string, chatId: string, text: string): Promise<void> {
  const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, { method: 'POST', signal: AbortSignal.timeout(10_000), headers: { 'content-type': 'application/json' }, body: JSON.stringify({ chat_id: chatId, text: text.slice(0, 4000), disable_web_page_preview: true }) });
  if (!response.ok) throw new Error(`telegram_${response.status}`);
}

function escapeHtml(value: string): string { return value.replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character] ?? character); }

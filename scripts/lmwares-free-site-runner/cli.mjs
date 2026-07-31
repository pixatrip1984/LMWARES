#!/usr/bin/env node
import { buildManifest, renderSite } from './generator.mjs';
import { sanitizeFreeImage } from './image-sanitizer.mjs';

const apiUrl = (process.env.LMWARES_PUBLIC_API_URL ?? 'http://127.0.0.1:8887').replace(/\/$/, '');
const runnerToken = process.env.LMWARES_FREE_RUNNER_TOKEN ?? 'local-free-runner-token';
const runnerId = process.env.LMWARES_FREE_RUNNER_ID ?? `local-free-runner-${process.pid}`;

async function main() {
  const claimed = await post('/internal/free-jobs/claim', { runnerId });
  if (!claimed.job) {
    const dispatched = await post('/internal/free-notifications/dispatch', { runnerId });
    console.log(JSON.stringify({
      status: dispatched.notification ? dispatched.notification.status : 'idle',
      message: dispatched.notification
        ? 'Se procesó una notificación Free pendiente.'
        : 'No hay jobs ni notificaciones Free en cola.',
      notification: dispatched.notification,
    }, null, 2));
    return;
  }

  const { job, intake, contacts, assets } = claimed;
  try {
    const sanitizedAssets = [];
    for (const entry of assets) {
      if (entry.sanitized) {
        sanitizedAssets.push(entry.sanitized);
        continue;
      }
      const source = await getSource(entry.sourcePath);
      const sanitized = await sanitizeFreeImage(source);
      const uploaded = await putSanitized(
        `/internal/free-jobs/${encodeURIComponent(job.id)}/assets/${encodeURIComponent(entry.asset.id)}/sanitized`,
        sanitized,
      );
      sanitizedAssets.push(uploaded);
    }

    const manifest = buildManifest({ job, intake, contacts, assets: sanitizedAssets });
    const indexHtml = renderSite({
      intake,
      contacts,
      assets: sanitizedAssets,
      manifest,
      apiUrl,
    });
    const completed = await post(`/internal/free-jobs/${job.id}/complete`, {
      runnerId,
      indexHtml,
      manifest,
    });
    const dispatched = await post('/internal/free-notifications/dispatch', { runnerId });
    console.log(JSON.stringify({
      status: 'published',
      ...completed,
      notification: dispatched.notification,
    }, null, 2));
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Error desconocido en runner Free.';
    await post(`/internal/free-jobs/${job.id}/fail`, {
      runnerId,
      code: 'free_runner_failed',
      message,
    }).catch(() => {});
    throw error;
  }
}

async function post(path, body) {
  const response = await fetch(`${apiUrl}${path}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${runnerToken}`,
      'X-LMWares-Runner-Id': runnerId,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify(body),
  });
  const text = await response.text();
  const data = text ? JSON.parse(text) : null;
  if (!response.ok) {
    throw new Error(data?.error?.message ?? `HTTP ${response.status}`);
  }
  return data;
}

async function getSource(path) {
  const response = await fetch(`${apiUrl}${path}`, {
    headers: {
      Authorization: `Bearer ${runnerToken}`,
      'X-LMWares-Runner-Id': runnerId,
      Accept: 'image/*',
    },
  });
  if (!response.ok) {
    throw new Error(await responseError(response));
  }
  return Buffer.from(await response.arrayBuffer());
}

async function putSanitized(path, sanitized) {
  const response = await fetch(`${apiUrl}${path}`, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${runnerToken}`,
      'X-LMWares-Runner-Id': runnerId,
      'Content-Type': sanitized.contentType,
      'Content-Length': String(sanitized.bytes.byteLength),
      'X-LMWares-Checksum': sanitized.checksum,
      Accept: 'application/json',
    },
    body: sanitized.bytes,
  });
  const text = await response.text();
  const data = text ? JSON.parse(text) : null;
  if (!response.ok) {
    throw new Error(data?.error?.message ?? `HTTP ${response.status}`);
  }
  return data;
}

async function responseError(response) {
  const text = await response.text();
  if (!text) return `HTTP ${response.status}`;
  try {
    const data = JSON.parse(text);
    return data?.error?.message ?? `HTTP ${response.status}`;
  } catch {
    return `HTTP ${response.status}`;
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});

import { stdin, stdout } from 'node:process';
import { readPublicActiveRun, updateStudioProgress } from './studio-run-state.mjs';

const activeRunPath = process.env.LMWARES_DEMO_ACTIVE_RUN_PATH
  ?? 'C:\\dev\\lmwares-demos\\control\\active-run.json';
let buffer = Buffer.alloc(0);

stdin.on('data', (chunk) => { buffer = Buffer.concat([buffer, chunk]); void consume(); });
stdin.on('error', () => { process.exitCode = 1; });

function respond(message) {
  const payload = Buffer.from(JSON.stringify(message), 'utf8');
  const header = Buffer.alloc(4); header.writeUInt32LE(payload.length, 0);
  stdout.write(Buffer.concat([header, payload]));
}

async function consume() {
  while (buffer.length >= 4) {
    const length = buffer.readUInt32LE(0);
    if (length > 1_000_000 || buffer.length < length + 4) return;
    const raw = buffer.subarray(4, 4 + length); buffer = buffer.subarray(4 + length);
    let response;
    let requestId = '';
    try {
      const request = JSON.parse(raw.toString('utf8'));
      requestId = request.requestId || '';
      if (request?.type === 'studio:get-active-run') response = { ok: true, requestId, run: readPublicActiveRun(activeRunPath) };
      else if (request?.type === 'studio:update-run-status') response = { ok: true, requestId, progress: updateStudioProgress(activeRunPath, request) };
      else throw new Error('Solicitud Native Messaging no permitida.');
    } catch (error) {
      response = { ok: false, requestId, error: error instanceof Error ? error.message : 'Bridge error.' };
    }
    respond(response);
  }
}

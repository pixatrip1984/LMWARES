import { stdin, stdout } from 'node:process';
import { stageDownloadedArtifact } from './protocol.mjs';

const config = {
  incomingRoot: process.env.LMWARES_DEMO_INCOMING_ROOT ?? 'C:\\dev\\lmwares-demo-incoming',
  stagingRoot: process.env.LMWARES_DEMO_STAGING_ROOT ?? 'C:\\dev\\lmwares-demos\\.staging',
};
let buffer = Buffer.alloc(0);
stdin.on('data', (chunk) => { buffer = Buffer.concat([buffer, chunk]); void consume(); });
stdin.on('error', () => process.exitCode = 1);

async function consume() {
  while (buffer.length >= 4) {
    const length = buffer.readUInt32LE(0);
    if (length > 1_000_000 || buffer.length < length + 4) return;
    const payload = buffer.subarray(4, 4 + length); buffer = buffer.subarray(4 + length);
    let response;
    try { response = await stageDownloadedArtifact(JSON.parse(payload.toString('utf8')), config); }
    catch (error) { response = { ok: false, error: error instanceof Error ? error.message : 'Native host error.' }; }
    const body = Buffer.from(JSON.stringify(response), 'utf8');
    const header = Buffer.alloc(4); header.writeUInt32LE(body.length, 0); stdout.write(Buffer.concat([header, body]));
  }
}

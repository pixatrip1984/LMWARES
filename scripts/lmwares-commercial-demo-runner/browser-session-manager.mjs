import { spawn } from 'node:child_process';

export function profileArgument(userDataDir) {
  const normalized = String(userDataDir || '').replace(/\\+$/, '').toLowerCase();
  if (!/^[a-z]:\\[^\r\n]+$/i.test(normalized)) throw new Error('La ruta del perfil dedicado no es válida.');
  return `--user-data-dir=${normalized}`;
}

export async function closeBrowserGracefully({ endpoint = 'http://127.0.0.1:9223', timeoutMs = 20_000, fetchImpl = fetch, now = Date.now, sleep = delay } = {}) {
  let version;
  try {
    const response = await fetchImpl(new URL('/json/version', endpoint));
    if (!response.ok) return { closed: true, reason: 'not-running' };
    version = await response.json();
  } catch { return { closed: true, reason: 'not-running' }; }
  if (!version?.webSocketDebuggerUrl) throw new Error('DevTools no expuso el endpoint de navegador para un cierre ordenado.');
  await command(version.webSocketDebuggerUrl, 'Browser.close');
  const deadline = now() + timeoutMs;
  while (now() < deadline) {
    try {
      const response = await fetchImpl(new URL('/json/version', endpoint));
      if (!response.ok) return { closed: true, reason: 'closed' };
    } catch { return { closed: true, reason: 'closed' }; }
    await sleep(250);
  }
  return { closed: false, reason: 'timeout' };
}

export async function launchDedicatedBrowser({ launcherPath, executionMode, debuggingPort = 9223, runner = runProcess } = {}) {
  if (!launcherPath) throw new Error('Falta el lanzador del navegador dedicado.');
  if (!['interactive', 'isolated-desktop'].includes(executionMode)) throw new Error('El modo de transición no es válido.');
  await runner('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', launcherPath, '-ExecutionMode', executionMode, '-DebuggingPort', String(debuggingPort)]);
  return { launched: true, executionMode };
}

export async function transitionBrowserSession({ action, launcherPath, endpoint, debuggingPort, close = closeBrowserGracefully, launch = launchDedicatedBrowser } = {}) {
  const mode = action === 'open-interactive' ? 'interactive' : action === 'return-background' ? 'isolated-desktop' : null;
  if (!mode) return { transitioned: false, reason: 'no-action' };
  const closed = await close({ endpoint });
  if (!closed.closed) return { transitioned: false, reason: 'close-timeout' };
  const launched = await launch({ launcherPath, executionMode: mode, debuggingPort });
  return { transitioned: true, mode, closed, launched };
}

function command(url, method) {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(url);
    const timeout = setTimeout(() => { socket.close(); reject(new Error('DevTools no confirmó el cierre ordenado.')); }, 5_000);
    socket.addEventListener('open', () => socket.send(JSON.stringify({ id: 1, method })));
    socket.addEventListener('message', (event) => {
      const message = JSON.parse(event.data);
      if (message.id !== 1) return;
      clearTimeout(timeout); socket.close();
      if (message.error) reject(new Error(message.error.message || 'DevTools rechazó el cierre ordenado.'));
      else resolve(message.result || {});
    });
    socket.addEventListener('error', () => { clearTimeout(timeout); reject(new Error('No se pudo conectar a DevTools para cerrar el navegador.')); });
  });
}

function runProcess(commandName, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(commandName, args, { stdio: 'inherit', shell: false, windowsHide: true });
    child.once('error', reject);
    child.once('exit', (code) => code === 0 ? resolve() : reject(new Error(`${commandName} terminó con código ${code}.`)));
  });
}

function delay(milliseconds) { return new Promise((resolve) => setTimeout(resolve, milliseconds)); }

const endpoint = process.env.LMWARES_DEMO_BROWSER_DEBUG_URL ?? 'http://127.0.0.1:9223';
const targets = await (await fetch(`${endpoint}/json/list`)).json();
const worker = targets.find((target) => target.type === 'service_worker' && /\/demo-service-worker\.js$/.test(target.url));
if (!worker?.webSocketDebuggerUrl) {
  console.log(JSON.stringify({ status: 'extension_worker_missing', targets: targets.map(({ type, url }) => ({ type, url })) }, null, 2));
  process.exitCode = 1;
} else {
  const extensionState = JSON.parse(await evaluate(worker.webSocketDebuggerUrl, `(async () => {
    const stored = await chrome.storage.local.get('lmwares.demo-studio.state.v1');
    const state = stored['lmwares.demo-studio.state.v1'] || {};
    const tabs = await chrome.tabs.query({ url: 'https://chatgpt.com/*' });
    return JSON.stringify({
      runId: state.runId ?? null, executionGeneration: state.executionGeneration ?? null,
      status: state.status ?? null, message: state.message ?? null,
      conversationId: state.conversationId ?? null,
      activeJob: state.activeJob ? { stage: state.activeJob.stage, contract: state.activeJob.contract ?? null, fragmentId: state.activeJob.fragmentId ?? null, retryCount: Number(state.activeJob.retryCount || 0), attemptId: state.activeJob.attemptId } : null,
      assetCount: Object.keys(state.assets || {}).length, hasCreativePlan: Boolean(state.creativePlan), hasCodePackage: Boolean(state.codePackage),
      tabs: tabs.map((tab) => ({ id: tab.id, active: tab.active, status: tab.status, url: tab.url })),
    });
  })()`));
  const contentProbe = JSON.parse(await evaluate(worker.webSocketDebuggerUrl, `(async () => {
    const stored = await chrome.storage.local.get('lmwares.demo-studio.state.v1');
    const state = stored['lmwares.demo-studio.state.v1'] || {};
    const tabs = await chrome.tabs.query({ url: 'https://chatgpt.com/*' });
    const tab = tabs.find((item) => item.id === state.tabId) || tabs.find((item) => state.conversationId && String(item.url || '').includes(state.conversationId));
    if (!tab?.id) return JSON.stringify({ ok: false, error: 'chat-tab-missing' });
    try {
      const response = await chrome.tabs.sendMessage(tab.id, { type: 'studio:inspect-bootstrap' });
      let jobProbe = null;
      if (state.activeJob) {
        const probe = await chrome.tabs.sendMessage(tab.id, { type: 'runner:probe-job', job: state.activeJob });
        const rawText = String(probe?.rawText || '');
        jobProbe = {
          status: probe?.status || null,
          code: probe?.code || null,
          message: probe?.message || null,
          parsedSchema: probe?.parsed?.schema_version || probe?.validation?.parsed?.schema_version || null,
          parsedKeys: probe?.parsed && typeof probe.parsed === 'object'
            ? Object.keys(probe.parsed)
            : probe?.validation?.parsed && typeof probe.validation.parsed === 'object' ? Object.keys(probe.validation.parsed) : [],
          rawSchemaTokens: [...new Set(rawText.match(/lmwares\.[a-z0-9.-]+\.v[0-9]+/gi) || [])],
          rawLength: rawText.length,
        };
      }
      return JSON.stringify({ ok: true, tabId: tab.id, response, jobProbe });
    } catch (error) {
      return JSON.stringify({ ok: false, tabId: tab.id, error: String(error) });
    }
  })()`));
  const chat = targets.find((target) => target.type === 'page' && extensionState.conversationId && target.url.includes(extensionState.conversationId));
  const chatState = chat?.webSocketDebuggerUrl ? JSON.parse(await evaluate(chat.webSocketDebuggerUrl, `JSON.stringify({
    readyState: document.readyState,
    editableCount: document.querySelectorAll('[contenteditable="true"]').length,
    promptTextarea: Boolean(document.querySelector('#prompt-textarea')),
    textareaCount: document.querySelectorAll('textarea').length,
    bodyTextLength: document.body?.innerText?.length ?? 0,
    visibilityState: document.visibilityState,
    hidden: document.hidden,
    hasFocus: document.hasFocus(),
    wasDiscarded: document.wasDiscarded === true,
    stopButtonCount: Array.from(document.querySelectorAll('button')).filter((button) => /stop-button/.test(button.dataset.testid || '') || /detener|stop generating|stop response/i.test(button.getAttribute('aria-label') || '')).length,
    progressCount: document.querySelectorAll('[aria-busy="true"], [role="progressbar"]').length,
  })`)) : null;
  console.log(JSON.stringify({ extension: extensionState, contentProbe, chat: chatState }, null, 2));
}

function evaluate(url, expression) {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(url);
    const timeout = setTimeout(() => {
      socket.close();
      reject(new Error('La página supervisora no respondió a DevTools.'));
    }, 5_000);
    socket.addEventListener('open', () => socket.send(JSON.stringify({
      id: 1,
      method: 'Runtime.evaluate',
      params: { expression, returnByValue: true, awaitPromise: true },
    })));
    socket.addEventListener('message', (event) => {
      const message = JSON.parse(event.data);
      if (message.id !== 1) return;
      clearTimeout(timeout);
      socket.close();
      if (message.result?.exceptionDetails) reject(new Error(message.result.exceptionDetails.text || 'Falló la inspección del supervisor.'));
      else resolve(message.result?.result?.value ?? JSON.stringify(message.result));
    });
    socket.addEventListener('error', () => {
      clearTimeout(timeout);
      reject(new Error('No se pudo conectar con la página supervisora.'));
    });
  });
}

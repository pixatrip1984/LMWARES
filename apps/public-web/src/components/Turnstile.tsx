import { useEffect, useRef } from 'react';

declare global {
  interface Window {
    turnstile?: {
      render: (el: HTMLElement, opts: Record<string, unknown>) => string;
      remove: (id: string) => void;
    };
  }
}

const SCRIPT_SRC = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';

/** Widget de Cloudflare Turnstile (render explícito). El token se valida en el Worker. */
export function Turnstile({
  siteKey,
  onToken,
  action = 'turnstile-spin-v1',
}: {
  siteKey: string;
  onToken: (token: string | null) => void;
  action?: string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const widgetId = useRef<string | undefined>(undefined);

  useEffect(() => {
    if (!siteKey) return;
    let cancelled = false;

    const render = () => {
      if (cancelled || !containerRef.current || !window.turnstile) return;
      widgetId.current = window.turnstile.render(containerRef.current, {
        sitekey: siteKey,
        action,
        callback: (token: string) => onToken(token),
        'expired-callback': () => onToken(null),
        'error-callback': () => onToken(null),
      });
    };

    if (window.turnstile) {
      render();
    } else {
      const base = SCRIPT_SRC.split('?')[0];
      const existing = document.querySelector(`script[src^="${base}"]`);
      if (existing) {
        existing.addEventListener('load', render);
      } else {
        const script = document.createElement('script');
        script.src = SCRIPT_SRC;
        script.async = true;
        script.defer = true;
        script.onload = render;
        document.head.appendChild(script);
      }
    }

    return () => {
      cancelled = true;
      if (widgetId.current && window.turnstile) window.turnstile.remove(widgetId.current);
    };
  }, [action, siteKey, onToken]);

  if (!siteKey) {
    return (
      <p className="text-sm text-amber-600">
        Turnstile no configurado (define <code>VITE_TURNSTILE_SITE_KEY</code>). En local el
        Worker lo omite si <code>TURNSTILE_DISABLED=1</code>.
      </p>
    );
  }
  return <div ref={containerRef} />;
}

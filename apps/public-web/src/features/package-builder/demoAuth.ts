export type DemoAuthProvider = 'google' | 'github' | 'microsoft';

export type DemoSession = {
  id: string;
  name: string;
  email: string;
  provider: DemoAuthProvider;
  createdAt: string;
};

const SESSION_KEY = 'lmwares.demo-session.v1';

const PROVIDER_NAMES: Record<DemoAuthProvider, string> = {
  google: 'Google',
  github: 'GitHub',
  microsoft: 'Microsoft',
};

export function createDemoSession(provider: DemoAuthProvider): DemoSession {
  const session: DemoSession = {
    id: `demo-${provider}`,
    name: 'Cuenta demo',
    email: `demo+${provider}@lmwares.local`,
    provider,
    createdAt: new Date().toISOString(),
  };
  window.sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));
  return session;
}

export function getDemoSession(): DemoSession | null {
  if (typeof window === 'undefined') return null;

  try {
    const raw = window.sessionStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const session = JSON.parse(raw) as DemoSession;
    if (!session.id || !session.email || !session.provider) return null;
    return session;
  } catch {
    return null;
  }
}

export function clearDemoSession() {
  window.sessionStorage.removeItem(SESSION_KEY);
}

export function getProviderName(provider: DemoAuthProvider) {
  return PROVIDER_NAMES[provider];
}

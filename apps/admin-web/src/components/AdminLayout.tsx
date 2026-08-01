import { useEffect, useState } from 'react';
import { Link, Outlet, useLocation } from 'react-router-dom';
import type { AdminMe } from '@starter/api-client';
import { Container } from '@starter/ui';
import { api } from '../lib/api';

const NAV = [
  { to: '/projects', label: 'Proyectos' },
  { to: '/operations', label: 'Operación' },
  { to: '/publications', label: 'Publicaciones' },
  { to: '/requests', label: 'Solicitudes' },
  { to: '/commercial-intakes', label: 'Paquetes' },
];

export function AdminLayout() {
  const [me, setMe] = useState<AdminMe | null>(null);
  const { pathname } = useLocation();
  const isProjectsWorkspace = pathname.startsWith('/projects');
  const isImmersiveWorkspace = pathname === '/projects/prepare';

  useEffect(() => {
    api
      .me()
      .then(setMe)
      .catch(() => setMe(null));
  }, []);

  return (
    <div className="flex min-h-screen flex-col">
      {!isImmersiveWorkspace ? (
        <header className="border-b border-surface-border bg-surface">
          <Container className="flex h-14 items-center justify-between">
            <div className="flex items-center gap-6">
              <span className="text-lg font-bold text-brand-700">LMWARES · Oracle</span>
              <nav className="flex gap-4 text-sm">
                {NAV.map((n) => (
                  <Link
                    key={n.to}
                    to={n.to}
                    className={
                      pathname.startsWith(n.to)
                        ? 'font-medium text-brand-700'
                        : 'text-gray-600 hover:text-gray-900'
                    }
                  >
                    {n.label}
                  </Link>
                ))}
              </nav>
            </div>
            <div className="text-sm text-gray-500">
              {me ? `${me.email} · ${me.role}` : 'no autenticado'}
            </div>
          </Container>
        </header>
      ) : null}
      <main className={isProjectsWorkspace ? 'min-h-0 flex-1 overflow-hidden' : 'flex-1 py-8'}>
        {isProjectsWorkspace ? (
          <Outlet />
        ) : (
          <Container>
            <Outlet />
          </Container>
        )}
      </main>
    </div>
  );
}

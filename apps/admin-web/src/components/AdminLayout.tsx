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
  { to: '/starter-domains', label: 'Dominios' },
] as const;

export function AdminLayout() {
  const [me, setMe] = useState<AdminMe | null>(null);
  const [pendingPackages, setPendingPackages] = useState(0);
  const { pathname } = useLocation();
  const isProjectsWorkspace = pathname.startsWith('/projects');
  const isImmersiveWorkspace = pathname === '/projects/prepare';

  useEffect(() => {
    api
      .me()
      .then(setMe)
      .catch(() => setMe(null));
  }, []);

  useEffect(() => {
    let cancelled = false;
    api
      .listCommercialPackageIntakes({ status: 'submitted', limit: 100 })
      .then((result) => {
        if (!cancelled) setPendingPackages(result.intakes.length);
      })
      .catch(() => {
        if (!cancelled) setPendingPackages(0);
      });
    return () => {
      cancelled = true;
    };
  }, [pathname]);

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
                    <span className="inline-flex items-center gap-2">
                      {n.label}
                      {n.to === '/commercial-intakes' && pendingPackages > 0 ? (
                        <span className="rounded-full bg-brand-700 px-2 py-0.5 text-[11px] font-semibold leading-none text-white">
                          {pendingPackages}
                        </span>
                      ) : null}
                    </span>
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

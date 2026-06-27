import { useEffect, useState } from 'react';
import { Link, Outlet, useLocation } from 'react-router-dom';
import type { AdminMe } from '@starter/api-client';
import { Container } from '@starter/ui';
import { api } from '../lib/api';

const NAV = [
  { to: '/', label: 'Inicio' },
  { to: '/publications', label: 'Publicaciones' },
  { to: '/requests', label: 'Solicitudes' },
];

export function AdminLayout() {
  const [me, setMe] = useState<AdminMe | null>(null);
  const { pathname } = useLocation();

  useEffect(() => {
    api.me().then(setMe).catch(() => setMe(null));
  }, []);

  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-b border-surface-border bg-surface">
        <Container className="flex h-14 items-center justify-between">
          <div className="flex items-center gap-6">
            <span className="text-lg font-bold text-brand-700">Starter · Admin</span>
            <nav className="flex gap-4 text-sm">
              {NAV.map((n) => (
                <Link
                  key={n.to}
                  to={n.to}
                  className={
                    (n.to === '/' ? pathname === '/' : pathname.startsWith(n.to))
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
      <main className="flex-1 py-8">
        <Container>
          <Outlet />
        </Container>
      </main>
    </div>
  );
}

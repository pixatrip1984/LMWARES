import { Link, Outlet } from 'react-router-dom';
import { Container } from '@starter/ui';

export function SiteLayout() {
  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-b border-surface-border bg-surface">
        <Container className="flex h-14 items-center justify-between">
          <Link to="/" className="text-lg font-bold text-brand-700">
            Starter
          </Link>
          <nav className="flex gap-4 text-sm">
            <Link to="/" className="text-gray-600 hover:text-gray-900">
              Catálogo
            </Link>
            <Link to="/contacto" className="text-gray-600 hover:text-gray-900">
              Contacto
            </Link>
          </nav>
        </Container>
      </header>

      <main className="flex-1 py-8">
        <Container>
          <Outlet />
        </Container>
      </main>

      <footer className="border-t border-surface-border bg-surface py-6 text-center text-sm text-gray-500">
        Plantilla madre Cloudflare-first · base reutilizable
      </footer>
    </div>
  );
}

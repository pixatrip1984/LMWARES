import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import { Container } from '@starter/ui';

export function SiteLayout() {
  const { pathname } = useLocation();
  const fullscreenApp =
    pathname === '/' ||
    pathname === '/contratar' ||
    pathname === '/acceso' ||
    pathname === '/configurar' ||
    pathname.startsWith('/pago/');

  return (
    <div className="flex min-h-screen flex-col">
      {fullscreenApp ? null : (
        <header className="sticky top-0 z-30 border-b border-black/10 bg-white/92 backdrop-blur">
          <Container className="flex h-16 max-w-7xl items-center justify-between">
            <Link to="/contratar" className="flex items-center gap-3">
              <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#17201b] text-sm font-black text-white">
                LM
              </span>
              <span>
                <span className="block text-base font-black leading-none text-[#17201b]">
                  LMwares
                </span>
                <span className="block text-xs font-semibold text-[#66736a]">
                  servicios web para negocios
                </span>
              </span>
            </Link>
            <nav className="flex items-center gap-2 text-xs font-semibold sm:text-sm">
              <NavLink
                to="/contratar"
                className={({ isActive }) =>
                  [
                    'rounded-lg px-2.5 py-2 transition sm:px-3',
                    isActive
                      ? 'bg-[#17201b] text-white hover:bg-[#2b3931]'
                      : 'border border-black/10 text-[#536158] hover:bg-[#f3f5f2]',
                  ].join(' ')
                }
              >
                Contratar
              </NavLink>
            </nav>
          </Container>
        </header>
      )}

      <main className="flex-1">
        <Outlet />
      </main>

      {fullscreenApp ? null : (
        <footer className="border-t border-black/10 bg-white py-6 text-center text-sm text-[#66736a]">
          LMwares · prueba operativa de 90 dias · dominio e indexacion disponibles al formalizar
          operacion
        </footer>
      )}
    </div>
  );
}

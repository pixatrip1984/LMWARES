import { useMemo } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import {
  parseSiteModules,
  siteModuleFromPath,
  SiteModuleComposer,
  type SiteModuleKey,
} from '../features/site-modules/SiteModuleComposer';
import { config } from '../lib/config';
import './starterSitePreviewPage.css';

const MODULE_LABELS: Record<SiteModuleKey, string> = {
  blog: 'Blog',
  galleries: 'Galerías',
  docs: 'Docs',
  forms: 'Formulario',
  events: 'Eventos',
};

export function StarterSitePreviewPage() {
  const params = useParams<{ projectId: string; '*': string }>();
  const projectId = params.projectId ?? '';
  const [searchParams] = useSearchParams();
  const modules = useMemo(
    () => {
      const routeModule = siteModuleFromPath(params['*']);
      const selected = searchParams.get('modules');
      return parseSiteModules([selected, routeModule].filter(Boolean).join(','));
    },
    [params['*'], searchParams],
  );

  if (!projectId) {
    return <main className="starter-site-preview__empty">Falta el identificador del proyecto.</main>;
  }

  return (
    <main className="starter-site-preview">
      <header className="starter-site-preview__hero">
        <span>LMWARES · PREVIEW STARTER</span>
        <p>Proyecto {projectId}</p>
        <h1>Sitio web dinámico y módulos públicos en un mismo lugar.</h1>
        <nav aria-label="Módulos habilitados">
          {modules.map((moduleKey) => (
            <a href={`#module-${moduleKey}`} key={moduleKey}>
              {MODULE_LABELS[moduleKey]}
            </a>
          ))}
        </nav>
      </header>

      {modules.length > 0 ? (
        <SiteModuleComposer
          projectId={projectId}
          apiBaseUrl={config.apiUrl}
          modules={modules}
        />
      ) : (
        <section className="starter-site-preview__empty">
          <strong>No hay módulos habilitados.</strong>
          <span>Usa `?modules=blog,galleries` para revisar una combinación.</span>
        </section>
      )}
    </main>
  );
}

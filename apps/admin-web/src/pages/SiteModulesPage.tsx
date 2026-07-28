import { Link, Navigate, useParams } from 'react-router-dom';
import { BlogWorkspace } from '../features/site-modules/blog/BlogWorkspace';
import { DocsWorkspace } from '../features/site-modules/docs/DocsWorkspace';
import { EventsWorkspace } from '../features/site-modules/events/EventsWorkspace';
import { FormsWorkspace } from '../features/site-modules/forms/FormsWorkspace';
import { GalleriesWorkspace } from '../features/site-modules/galleries/GalleriesWorkspace';
import './siteModulesPage.css';

const MODULES = [
  { key: 'blog', label: 'Blog', eyebrow: 'Contenido' },
  { key: 'galleries', label: 'Galerías', eyebrow: 'Portafolio' },
  { key: 'docs', label: 'Docs', eyebrow: 'Archivos' },
  { key: 'forms', label: 'Solicitudes', eyebrow: 'Captación' },
  { key: 'events', label: 'Eventos', eyebrow: 'Agenda' },
] as const;

type ModuleKey = (typeof MODULES)[number]['key'];

export function SiteModulesPage() {
  const { projectId, moduleKey } = useParams<{
    projectId: string;
    moduleKey: string;
  }>();

  if (!projectId) return <Navigate to="/projects" replace />;
  if (!isModuleKey(moduleKey)) {
    return <Navigate to={`/projects/${encodeURIComponent(projectId)}/modules/blog`} replace />;
  }

  return (
    <div className="site-modules-page">
      <aside className="site-modules-page__rail">
        <div className="site-modules-page__brand">
          <span className="site-modules-page__brand-mark" aria-hidden="true" />
          <div>
            <strong>LMWARES</strong>
            <span>Module Studio</span>
          </div>
        </div>

        <div className="site-modules-page__project">
          <span>Proyecto</span>
          <code>{projectId}</code>
        </div>

        <nav className="site-modules-page__nav" aria-label="Módulos del proyecto">
          {MODULES.map((module) => (
            <Link
              key={module.key}
              to={`/projects/${encodeURIComponent(projectId)}/modules/${module.key}`}
              className={module.key === moduleKey ? 'is-active' : undefined}
            >
              <span>{module.eyebrow}</span>
              <strong>{module.label}</strong>
            </Link>
          ))}
        </nav>

        <Link className="site-modules-page__back" to="/projects">
          ← Volver a Oracle
        </Link>
      </aside>

      <main className="site-modules-page__workspace">
        <ModuleWorkspace moduleKey={moduleKey} projectId={projectId} />
      </main>
    </div>
  );
}

function ModuleWorkspace({
  moduleKey,
  projectId,
}: {
  moduleKey: ModuleKey;
  projectId: string;
}) {
  if (moduleKey === 'blog') return <BlogWorkspace projectId={projectId} />;
  if (moduleKey === 'galleries') return <GalleriesWorkspace projectId={projectId} />;
  if (moduleKey === 'docs') return <DocsWorkspace projectId={projectId} />;
  if (moduleKey === 'forms') return <FormsWorkspace projectId={projectId} />;
  return <EventsWorkspace projectId={projectId} />;
}

function isModuleKey(value: string | undefined): value is ModuleKey {
  return MODULES.some((module) => module.key === value);
}

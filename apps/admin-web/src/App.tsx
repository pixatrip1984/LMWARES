import { Navigate, Route, Routes } from 'react-router-dom';
import { AdminLayout } from './components/AdminLayout';
import { DashboardPage } from './pages/DashboardPage';
import { ProjectsPage } from './pages/ProjectsPage';
import { PrepareWorkPage } from './pages/PrepareWorkPage';
import { PublicationsPage } from './pages/PublicationsPage';
import { PublicationEditPage } from './pages/PublicationEditPage';
import { RequestsPage } from './pages/RequestsPage';
import { RequestDetailPage } from './pages/RequestDetailPage';
import { SiteModulesPage } from './pages/SiteModulesPage';
import { CommercialIntakesPage } from './pages/CommercialIntakesPage';
import { StarterDomainsPage } from './pages/StarterDomainsPage';

export function App() {
  return (
    <Routes>
      <Route element={<AdminLayout />}>
        <Route index element={<Navigate to="/projects" replace />} />
        <Route path="/projects" element={<ProjectsPage />} />
        <Route path="/projects/prepare" element={<PrepareWorkPage />} />
        <Route
          path="/projects/:projectId/modules/:moduleKey"
          element={<SiteModulesPage />}
        />
        <Route path="/operations" element={<DashboardPage />} />
        <Route path="/publications" element={<PublicationsPage />} />
        <Route path="/publications/:id" element={<PublicationEditPage />} />
        <Route path="/requests" element={<RequestsPage />} />
        <Route path="/requests/:id" element={<RequestDetailPage />} />
        <Route path="/commercial-intakes" element={<CommercialIntakesPage />} />
        <Route path="/starter-domains" element={<StarterDomainsPage />} />
      </Route>
    </Routes>
  );
}

import { Route, Routes } from 'react-router-dom';
import { SiteLayout } from './components/SiteLayout';
import { CatalogPage } from './pages/CatalogPage';
import { DetailPage } from './pages/DetailPage';
import { ContactPage } from './pages/ContactPage';

export function App() {
  return (
    <Routes>
      <Route element={<SiteLayout />}>
        <Route index element={<CatalogPage />} />
        <Route path="/p/:slug" element={<DetailPage />} />
        <Route path="/contacto" element={<ContactPage />} />
        <Route path="*" element={<CatalogPage />} />
      </Route>
    </Routes>
  );
}

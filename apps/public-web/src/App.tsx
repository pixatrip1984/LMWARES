import { Route, Routes } from 'react-router-dom';
import { SiteLayout } from './components/SiteLayout';
import { ContactPage } from './pages/ContactPage';
import { ContractPage } from './pages/ContractPage';

export function App() {
  return (
    <Routes>
      <Route element={<SiteLayout />}>
        <Route index element={<ContractPage />} />
        <Route path="/contratar" element={<ContractPage />} />
        <Route path="/contacto" element={<ContactPage />} />
        <Route path="*" element={<ContractPage />} />
      </Route>
    </Routes>
  );
}

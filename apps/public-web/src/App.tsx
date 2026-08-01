import { Route, Routes } from 'react-router-dom';
import { SiteLayout } from './components/SiteLayout';
import { AuthPage } from './pages/AuthPage';
import { ContactPage } from './pages/ContactPage';
import { ContractPage } from './pages/ContractPage';
import { PackageBuilderPage } from './pages/PackageBuilderPage';
import { PaymentPage } from './pages/PaymentPage';
import { ImplementationPaymentPage } from './pages/ImplementationPaymentPage';
import { StarterSitePreviewPage } from './pages/StarterSitePreviewPage';

export function App() {
  return (
    <Routes>
      <Route path="/sites/:projectId/*" element={<StarterSitePreviewPage />} />
      <Route element={<SiteLayout />}>
        <Route index element={<ContractPage />} />
        <Route path="/contratar" element={<ContractPage />} />
        <Route path="/acceso" element={<AuthPage />} />
        <Route path="/configurar" element={<PackageBuilderPage />} />
        <Route path="/pago/:proposalId" element={<PaymentPage />} />
        <Route path="/pago/implementacion/:orderId" element={<ImplementationPaymentPage />} />
        <Route path="/contacto" element={<ContactPage />} />
        <Route path="*" element={<ContractPage />} />
      </Route>
    </Routes>
  );
}

import { PageHeader } from '@starter/ui';
import { ContactForm } from '../components/ContactForm';

export function ContactPage() {
  return (
    <div>
      <PageHeader title="Contacto" subtitle="Envíanos tu solicitud" />
      <ContactForm />
    </div>
  );
}

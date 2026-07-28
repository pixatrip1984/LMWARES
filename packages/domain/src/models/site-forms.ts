import type { Id, IsoDateTime, Metadata, Timestamps } from '../common';

export const SITE_FORM_FIELD_TYPES = [
  'text',
  'email',
  'tel',
  'textarea',
  'select',
  'checkbox',
] as const;
export type SiteFormFieldType = (typeof SITE_FORM_FIELD_TYPES)[number];

export const SITE_FORM_REQUEST_STATUSES = [
  'new',
  'in-progress',
  'responded',
  'closed',
  'spam',
] as const;
export type SiteFormRequestStatus = (typeof SITE_FORM_REQUEST_STATUSES)[number];

export type SiteFormAnswer = string | boolean;
export type SiteFormAnswers = Record<string, SiteFormAnswer>;

export interface SiteFormSelectOption {
  value: string;
  label: string;
}

/**
 * `id` es la única clave aceptada al recibir respuestas. El servidor obtiene
 * label, tipo, restricciones y opciones desde la definición publicada.
 */
export interface SiteFormField {
  id: string;
  type: SiteFormFieldType;
  label: string;
  required: boolean;
  placeholder?: string;
  helpText?: string;
  minLength?: number;
  maxLength?: number;
  options?: SiteFormSelectOption[];
}

export interface SiteFormDefinition {
  schemaVersion: 1;
  title: string;
  description: string;
  submitLabel: string;
  successMessage: string;
  fields: SiteFormField[];
}

export interface SiteForm extends Timestamps {
  id: Id;
  projectId: string;
  draftDefinition: SiteFormDefinition;
  publishedDefinition: SiteFormDefinition | null;
  draftRevision: number;
  publishedRevision: number | null;
  publishedAt: IsoDateTime | null;
  createdBy: string;
  updatedBy: string;
}

/** Contrato público deliberadamente limitado a la definición publicada. */
export interface PublicSiteForm {
  projectId: string;
  revision: number;
  publishedAt: IsoDateTime;
  definition: SiteFormDefinition;
}

export interface SiteFormRequestSummary {
  id: Id;
  projectId: string;
  formRevision: number;
  status: SiteFormRequestStatus;
  answers: SiteFormAnswers;
  submittedAt: IsoDateTime;
  updatedAt: IsoDateTime;
}

/** Detalle privado para el panel admin. Nunca se expone en el API público. */
export interface SiteFormRequest extends SiteFormRequestSummary {
  formId: Id;
  definitionSnapshot: SiteFormDefinition;
  internalPayload: Metadata;
}

export interface SiteFormRequestNote {
  id: Id;
  requestId: Id;
  authorEmail: string;
  body: string;
  createdAt: IsoDateTime;
}

export interface SiteFormStatusHistory {
  id: Id;
  requestId: Id;
  fromStatus: SiteFormRequestStatus | null;
  toStatus: SiteFormRequestStatus;
  changedBy: string | null;
  reason: string | null;
  createdAt: IsoDateTime;
}

export interface SiteFormRequestDetail {
  request: SiteFormRequest;
  notes: SiteFormRequestNote[];
  history: SiteFormStatusHistory[];
}

export const DEFAULT_SITE_FORM_DEFINITION: SiteFormDefinition = {
  schemaVersion: 1,
  title: 'Cuéntanos sobre tu solicitud',
  description: 'Comparte tus datos y el contexto necesario para poder responderte.',
  submitLabel: 'Enviar solicitud',
  successMessage: 'Recibimos tu solicitud. Te contactaremos pronto.',
  fields: [
    {
      id: 'name',
      type: 'text',
      label: 'Nombre',
      required: true,
      placeholder: 'Tu nombre',
      maxLength: 120,
    },
    {
      id: 'email',
      type: 'email',
      label: 'Correo',
      required: true,
      placeholder: 'nombre@empresa.com',
      maxLength: 254,
    },
    {
      id: 'message',
      type: 'textarea',
      label: '¿En qué podemos ayudarte?',
      required: true,
      placeholder: 'Describe brevemente tu solicitud',
      maxLength: 2000,
    },
  ],
};

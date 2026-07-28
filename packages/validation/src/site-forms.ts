import { z } from 'zod';
import { AppError } from '@starter/domain';

const SITE_FORM_FIELD_TYPES = ['text', 'email', 'tel', 'textarea', 'select', 'checkbox'] as const;
const SITE_FORM_REQUEST_STATUSES = ['new', 'in-progress', 'responded', 'closed', 'spam'] as const;
type SiteFormFieldType = (typeof SITE_FORM_FIELD_TYPES)[number];
type SiteFormAnswers = Record<string, string | boolean>;
interface SiteFormDefinition {
  schemaVersion: 1;
  title: string;
  description: string;
  submitLabel: string;
  successMessage: string;
  fields: Array<{
    id: string;
    type: SiteFormFieldType;
    label: string;
    required: boolean;
    placeholder?: string;
    helpText?: string;
    minLength?: number;
    maxLength?: number;
    options?: Array<{ value: string; label: string }>;
  }>;
}

const FIELD_ID_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,79}$/;
const PHONE_PATTERN = /^[0-9+()\-.\s]+$/;
const MAX_FIELDS = 30;
const MAX_OPTIONS = 50;
const MAX_DEFINITION_BYTES = 100_000;
const MAX_ANSWER_LENGTH = 4_000;

const selectOptionSchema = z
  .object({
    value: z.string().trim().min(1).max(120),
    label: z.string().trim().min(1).max(160),
  })
  .strict();

export const siteFormFieldSchema = z
  .object({
    id: z.string().trim().regex(FIELD_ID_PATTERN, 'La clave del campo es inválida.'),
    type: z.enum(SITE_FORM_FIELD_TYPES),
    label: z.string().trim().min(1).max(160),
    required: z.boolean(),
    placeholder: z.string().trim().max(240).optional(),
    helpText: z.string().trim().max(500).optional(),
    minLength: z.number().int().min(0).max(MAX_ANSWER_LENGTH).optional(),
    maxLength: z.number().int().min(1).max(MAX_ANSWER_LENGTH).optional(),
    options: z.array(selectOptionSchema).max(MAX_OPTIONS).optional(),
  })
  .strict()
  .superRefine((field, context) => {
    if (
      field.minLength !== undefined &&
      field.maxLength !== undefined &&
      field.minLength > field.maxLength
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['minLength'],
        message: 'La longitud mínima no puede exceder la máxima.',
      });
    }

    if (field.type === 'select') {
      if (!field.options?.length) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['options'],
          message: 'Un campo select necesita al menos una opción.',
        });
      }
      const values = new Set<string>();
      for (const [index, option] of (field.options ?? []).entries()) {
        if (values.has(option.value)) {
          context.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['options', index, 'value'],
            message: 'Los valores de las opciones deben ser únicos.',
          });
        }
        values.add(option.value);
      }
      if (field.minLength !== undefined || field.maxLength !== undefined) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['maxLength'],
          message: 'Un campo select no usa límites de longitud.',
        });
      }
    } else if (field.options !== undefined) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['options'],
        message: 'Solo los campos select aceptan opciones.',
      });
    }

    if (
      field.type === 'checkbox' &&
      (field.minLength !== undefined || field.maxLength !== undefined)
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['maxLength'],
        message: 'Un checkbox no usa límites de longitud.',
      });
    }

    const typeMaximum =
      field.type === 'email'
        ? 254
        : field.type === 'tel'
          ? 30
          : field.type === 'text'
            ? 500
            : MAX_ANSWER_LENGTH;
    if (field.minLength !== undefined && field.minLength > typeMaximum) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['minLength'],
        message: `El mínimo permitido para ${field.type} es ${typeMaximum}.`,
      });
    }
    if (field.maxLength !== undefined && field.maxLength > typeMaximum) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['maxLength'],
        message: `El máximo permitido para ${field.type} es ${typeMaximum}.`,
      });
    }
  });

export const siteFormDefinitionSchema = z
  .object({
    schemaVersion: z.literal(1),
    title: z.string().trim().min(1).max(200),
    description: z.string().trim().max(1000),
    submitLabel: z.string().trim().min(1).max(80),
    successMessage: z.string().trim().min(1).max(500),
    fields: z.array(siteFormFieldSchema).min(1).max(MAX_FIELDS),
  })
  .strict()
  .superRefine((definition, context) => {
    const ids = new Set<string>();
    for (const [index, field] of definition.fields.entries()) {
      if (ids.has(field.id)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['fields', index, 'id'],
          message: 'Cada campo necesita una clave única.',
        });
      }
      ids.add(field.id);
    }

    if (JSON.stringify(definition).length > MAX_DEFINITION_BYTES) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: [],
        message: 'La definición del formulario excede el tamaño permitido.',
      });
    }
  });
export type SiteFormDefinitionInput = z.infer<typeof siteFormDefinitionSchema>;

export const publicSiteFormSubmissionSchema = z
  .object({
    answers: z
      .record(
        z.string().regex(FIELD_ID_PATTERN),
        z.union([z.string().max(MAX_ANSWER_LENGTH), z.boolean()]),
      )
      .refine((answers) => Object.keys(answers).length <= MAX_FIELDS, 'Hay demasiadas respuestas.'),
    website: z.string().max(240).optional().default(''),
    turnstileToken: z.string().min(1).max(2048).optional(),
  })
  .strict();
export type PublicSiteFormSubmissionInput = z.infer<typeof publicSiteFormSubmissionSchema>;

export const listSiteFormRequestsQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(50),
    status: z.enum(SITE_FORM_REQUEST_STATUSES).optional(),
  })
  .strict();

export const updateSiteFormRequestStatusSchema = z
  .object({
    status: z.enum(SITE_FORM_REQUEST_STATUSES),
    reason: z.string().trim().max(500).nullish(),
  })
  .strict();

export const createSiteFormRequestNoteSchema = z
  .object({
    body: z.string().trim().min(1).max(4000),
  })
  .strict();

/**
 * Valida únicamente valores identificados por `field.id`. Cualquier campo
 * desconocido, tipo enviado por el cliente u opción fuera de la publicación
 * exacta se rechaza.
 */
export function validatePublishedSiteFormAnswers(
  definition: SiteFormDefinition,
  rawAnswers: Record<string, string | boolean>,
): SiteFormAnswers {
  const details: Record<string, string[]> = {};
  const normalized: SiteFormAnswers = {};
  const fieldsById = new Map(definition.fields.map((field) => [field.id, field]));

  for (const answerId of Object.keys(rawAnswers)) {
    if (!fieldsById.has(answerId)) {
      addDetail(details, `answers.${answerId}`, 'El campo no pertenece al formulario publicado.');
    }
  }

  for (const field of definition.fields) {
    const value = rawAnswers[field.id];
    const path = `answers.${field.id}`;

    if (field.type === 'checkbox') {
      if (value !== undefined && typeof value !== 'boolean') {
        addDetail(details, path, 'La respuesta debe ser verdadero o falso.');
        continue;
      }
      const checked = value === true;
      if (field.required && !checked) {
        addDetail(details, path, 'Debes aceptar este campo.');
      }
      normalized[field.id] = checked;
      continue;
    }

    if (value !== undefined && typeof value !== 'string') {
      addDetail(details, path, 'La respuesta debe ser texto.');
      continue;
    }

    const text = (value ?? '').trim();
    if (field.required && text.length === 0) {
      addDetail(details, path, 'Este campo es obligatorio.');
      normalized[field.id] = text;
      continue;
    }

    if (text.length > 0) {
      const maximum = effectiveMaximum(field.type, field.maxLength);
      if (text.length > maximum) {
        addDetail(details, path, `No puede exceder ${maximum} caracteres.`);
      }
      if (field.minLength !== undefined && text.length < field.minLength) {
        addDetail(details, path, `Debe contener al menos ${field.minLength} caracteres.`);
      }
      if (field.type === 'email' && !z.string().email().safeParse(text).success) {
        addDetail(details, path, 'Escribe un correo válido.');
      }
      if (field.type === 'tel' && (text.length < 5 || !PHONE_PATTERN.test(text))) {
        addDetail(details, path, 'Escribe un teléfono válido.');
      }
      if (
        field.type === 'select' &&
        !(field.options ?? []).some((option) => option.value === text)
      ) {
        addDetail(details, path, 'Selecciona una opción válida.');
      }
    }

    normalized[field.id] = field.type === 'email' ? text.toLowerCase() : text;
  }

  if (Object.keys(details).length > 0) {
    throw new AppError('validation_error', 'Revisa las respuestas del formulario.', details);
  }
  return normalized;
}

function effectiveMaximum(type: SiteFormFieldType, configured?: number) {
  const hardMaximum =
    type === 'email' ? 254 : type === 'tel' ? 30 : type === 'text' ? 500 : MAX_ANSWER_LENGTH;
  return Math.min(configured ?? hardMaximum, hardMaximum);
}

function addDetail(details: Record<string, string[]>, path: string, message: string) {
  (details[path] ??= []).push(message);
}

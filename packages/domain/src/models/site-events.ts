import type { Id, IsoDateTime, Timestamps } from '../common';

export const SITE_EVENT_STATUSES = ['draft', 'published', 'cancelled', 'completed'] as const;
export type SiteEventStatus = (typeof SITE_EVENT_STATUSES)[number];

export const SITE_EVENT_REGISTRATION_STATUSES = ['confirmed', 'cancelled'] as const;
export type SiteEventRegistrationStatus = (typeof SITE_EVENT_REGISTRATION_STATUSES)[number];

export interface SiteEventCoverAsset {
  id: Id;
  key: string;
  contentType: string;
}

/** Evento de un proyecto LMWARES. Las fechas de negocio siempre están en UTC. */
export interface SiteEvent extends Timestamps {
  id: Id;
  projectId: string;
  slug: string;
  title: string;
  summary: string | null;
  description: string | null;
  venueName: string | null;
  venueAddress: string | null;
  /** Zona IANA usada únicamente para presentar las fechas al visitante. */
  timezone: string;
  startsAtUtc: IsoDateTime;
  endsAtUtc: IsoDateTime;
  registrationClosesAtUtc: IsoDateTime | null;
  /** null significa cupo ilimitado. */
  capacity: number | null;
  status: SiteEventStatus;
  coverAssetId: Id | null;
  cover: SiteEventCoverAsset | null;
  publishedAt: IsoDateTime | null;
  createdBy: string;
  updatedBy: string;
}

export interface SiteEventWithAvailability extends SiteEvent {
  registrationCount: number;
  /** null significa que no existe límite de cupo. */
  spotsRemaining: number | null;
  registrationOpen: boolean;
}

export interface SiteEventRegistration extends Timestamps {
  id: Id;
  eventId: Id;
  fullName: string;
  email: string;
  phone: string | null;
  notes: string | null;
  status: SiteEventRegistrationStatus;
}

/** Respuesta pública mínima después de inscribir; nunca contiene el padrón. */
export interface SiteEventRegistrationReceipt {
  id: Id;
  status: SiteEventRegistrationStatus;
  createdAt: IsoDateTime;
}

export type PublicSiteEvent = Omit<
  SiteEventWithAvailability,
  'cover' | 'createdBy' | 'updatedBy'
> & {
  coverUrl: string | null;
};

import { createHttpClient } from '@starter/api-client';
import { config } from '../../../lib/config';

export type EventStatus = 'draft' | 'published' | 'cancelled' | 'completed';
export type RegistrationStatus = 'confirmed' | 'cancelled';

export interface EventRecord {
  id: string;
  projectId: string;
  slug: string;
  title: string;
  summary: string | null;
  description: string | null;
  venueName: string | null;
  venueAddress: string | null;
  timezone: string;
  startsAtUtc: string;
  endsAtUtc: string;
  registrationClosesAtUtc: string | null;
  capacity: number | null;
  status: EventStatus;
  coverAssetId: string | null;
  cover: { id: string; key: string; contentType: string } | null;
  coverUrl: string | null;
  publishedAt: string | null;
  publishedRevisionAt: string | null;
  hasUnpublishedChanges: boolean;
  createdBy: string;
  updatedBy: string;
  createdAt: string;
  updatedAt: string;
  registrationCount: number;
  spotsRemaining: number | null;
  registrationOpen: boolean;
}

export interface EventRegistration {
  id: string;
  eventId: string;
  fullName: string;
  email: string;
  phone: string | null;
  notes: string | null;
  status: RegistrationStatus;
  createdAt: string;
  updatedAt: string;
}

export interface EventWritePayload {
  slug: string;
  title: string;
  summary: string | null;
  description: string | null;
  venueName: string | null;
  venueAddress: string | null;
  timezone: string;
  startsAtUtc: string;
  endsAtUtc: string;
  registrationClosesAtUtc: string | null;
  capacity: number | null;
  coverAssetId: string | null;
}

const http = createHttpClient({
  baseUrl: config.apiUrl,
  withCredentials: true,
});

function modulePath(projectId: string): string {
  return `/admin/projects/${encodeURIComponent(projectId)}/modules/events`;
}

export const eventsApi = {
  async list(projectId: string): Promise<EventRecord[]> {
    const response = await http.get<{ events: EventRecord[] }>(modulePath(projectId));
    return response.events;
  },

  async listPublished(projectId: string): Promise<EventRecord[]> {
    const response = await http.get<{ events: EventRecord[] }>(
      `${modulePath(projectId)}/published`,
    );
    return response.events;
  },

  get(projectId: string, eventId: string) {
    return http.get<{ event: EventRecord; registrations: EventRegistration[] }>(
      `${modulePath(projectId)}/${encodeURIComponent(eventId)}`,
    );
  },

  create(projectId: string, input: EventWritePayload) {
    return http.post<EventRecord>(modulePath(projectId), input);
  },

  update(projectId: string, eventId: string, input: EventWritePayload) {
    return http.patch<EventRecord>(
      `${modulePath(projectId)}/${encodeURIComponent(eventId)}`,
      input,
    );
  },

  setStatus(projectId: string, eventId: string, status: EventStatus) {
    return http.patch<EventRecord>(
      `${modulePath(projectId)}/${encodeURIComponent(eventId)}/status`,
      { status },
    );
  },

  listRegistrations(projectId: string, eventId: string) {
    return http.get<{ event: EventRecord; registrations: EventRegistration[] }>(
      `${modulePath(projectId)}/${encodeURIComponent(eventId)}/registrations`,
    );
  },

  setRegistrationStatus(
    projectId: string,
    eventId: string,
    registrationId: string,
    status: RegistrationStatus,
  ) {
    return http.patch<EventRegistration>(
      `${modulePath(projectId)}/${encodeURIComponent(eventId)}/registrations/${encodeURIComponent(registrationId)}`,
      { status },
    );
  },
};

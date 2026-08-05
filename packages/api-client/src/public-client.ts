import type { Paginated, PublicAuthSession, Publication, PublicUser } from '@starter/domain';
import type {
  CreateFreeIntakeInput,
  CreatePackageIntakeInput,
  CreateRequestInput,
  SubmitFreeIntakeInput,
} from '@starter/validation';
import type { CreateTestPackageProposalInput } from '@starter/validation';
import { createHttpClient } from './http';

/** Publicación de detalle con sus imágenes resueltas (URLs públicas). */
export interface PublicationDetail extends Publication {
  images: Array<{ id: string; url: string; alt: string | null; position: number }>;
}

export interface CreateRequestResult {
  id: string;
  status: string;
}

export interface CreateFreeIntakeResult {
  id: string;
  slug: string;
  status: string;
}

export interface FreeSlugAvailability {
  slug: string;
  available: boolean;
  suggestions: string[];
}

export interface MapSearchLocation {
  id: string;
  address: string;
  latitude: number;
  longitude: number;
  category: string;
  type: string;
}

export interface MapSearchResult {
  results: MapSearchLocation[];
  approximate?: boolean;
  attribution: string;
}

export interface MapReverseResult {
  result: MapSearchLocation | null;
  attribution: string;
}

export interface FreeImageUploadResult {
  id: string;
  fileAssetId: string;
  status: string;
  checksum: string;
}

export interface SubmitFreeIntakeResult {
  id: string;
  slug: string;
  status: string;
  jobStatus: string | null;
  publicUrl: string | null;
}

export interface FreeIntakeStatusResult {
  intake: {
    id: string;
    slug: string;
    status: string;
    publishedUrl: string | null;
  };
  job: { status: string; errorCode: string | null; errorMessage: string | null } | null;
  publicUrl: string | null;
  assetCount: number;
}

export interface AccountNotification {
  id: string;
  kind: string;
  title: string;
  summary: string;
  body: string[];
  plan: string;
  siteName: string;
  referenceId: string | null;
  actionUrl: string | null;
  actionLabel: string | null;
  deliveryStatus: string;
  readAt: string | null;
  sentAt: string | null;
  createdAt: string;
}

export interface AccountSite {
  id: string;
  slug: string;
  siteName: string;
  plan: 'free';
  status: string;
  publicUrl: string | null;
  createdAt: string;
  submittedAt: string | null;
  publishedAt: string | null;
  updatedAt: string;
}

export interface AccountOverview {
  user: PublicUser;
  unreadCount: number;
  notifications: AccountNotification[];
  sites: AccountSite[];
  commercialIntakes: PublicPackageIntake[];
}

export interface PublicPackageProposal {
  id: string;
  plan: 'starter' | 'pro';
  modules: string[];
  marketing: boolean;
  status:
    | 'approved_test'
    | 'checkout_creating'
    | 'checkout_failed'
    | 'payment_pending'
    | 'payment_failed'
    | 'paid';
  amountCents: number;
  currency: 'MXN';
  pricingVersion: string;
  checkoutUrl: string | null;
  checkoutExpiresAt: string | null;
  lastProviderStatus: string | null;
  paymentReviewRequired: boolean;
  paidAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PublicPackageIntake {
  id: string;
  plan: 'starter' | 'pro';
  modules: string[];
  marketing: boolean;
  status: 'submitted' | 'scope_review' | 'offer_ready' | 'declined' | 'converted';
  estimatedImplementationCents: number;
  estimatedMonthlyCents: number;
  currency: 'MXN';
  pricingVersion: string;
  maintenanceStartPolicy: 'on_go_live';
  proposalId: string | null;
  currentOffer: PublicCommercialOffer | null;
  implementationPhases: PublicBillingOrder[];
  workOrder: PublicStarterWorkOrder | null;
  maintenanceSubscription: PublicMaintenanceSubscription | null;
  submittedAt: string;
  updatedAt: string;
}

export interface PublicStarterWorkOrder {
  id: string;
  status:
    | 'awaiting_provisioning'
    | 'in_build'
    | 'client_review'
    | 'ready_to_publish'
    | 'live'
    | 'canceled';
  publishedUrl: string | null;
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PublicBillingOrder {
  id: string;
  purpose: 'implementation' | 'cart';
  commercialOfferId: string | null;
  intakeId: string | null;
  status:
    | 'ready'
    | 'checkout_creating'
    | 'checkout_failed'
    | 'payment_pending'
    | 'payment_failed'
    | 'paid'
    | 'refunded'
    | 'charged_back'
    | 'canceled';
  phase: 1 | 2 | 3 | 4;
  amountCents: number;
  currency: 'MXN';
  checkoutUrl: string | null;
  checkoutExpiresAt: string | null;
  lastProviderStatus: string | null;
  paymentReviewRequired: boolean;
  paidAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PublicCommercialOffer {
  id: string;
  intakeId: string;
  version: number;
  status: 'issued' | 'accepted' | 'superseded' | 'declined' | 'expired';
  plan: 'starter' | 'pro';
  modules: string[];
  marketing: boolean;
  implementationAmountCents: number;
  monthlyAmountCents: number;
  currency: 'MXN';
  scopeSummary: string;
  implementationDescription: string;
  recurringDescription: string;
  maintenanceStartPolicy: 'on_go_live';
  termsVersion: string;
  terms: {
    implementationPayment: string;
    recurringStart: string;
    initialHosting: string;
    cancellation: string;
    support: string;
  };
  validUntil: string;
  issuedAt: string;
  acceptedAt: string | null;
  updatedAt: string;
}

export interface PublicPackageSubscription {
  id: string;
  proposalId: string;
  status:
    | 'creating'
    | 'creation_failed'
    | 'pending_authorization'
    | 'active'
    | 'payment_attention'
    | 'paused'
    | 'canceled'
    | 'disputed';
  amountCents: number;
  currency: 'MXN';
  frequency: number;
  frequencyType: 'months';
  pricingVersion: string;
  authorizationUrl: string | null;
  providerStatus: string | null;
  nextPaymentDate: string | null;
  lastAuthorizedPaymentId: string | null;
  lastAuthorizedPaymentStatus: string | null;
  authorizedAt: string | null;
  canceledAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PublicMaintenanceSubscription {
  id: string;
  workOrderId: string;
  status: PublicPackageSubscription['status'];
  amountCents: number;
  currency: 'MXN';
  frequency: 1;
  frequencyType: 'months';
  pricingVersion: string;
  authorizationUrl: string | null;
  providerStatus: string | null;
  nextPaymentDate: string | null;
  lastAuthorizedPaymentId: string | null;
  lastAuthorizedPaymentStatus: string | null;
  authorizedAt: string | null;
  canceledAt: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Cliente del Public API Worker. Solo expone datos/acciones públicas. */
export function createPublicClient(baseUrl: string) {
  const normalizedBaseUrl = baseUrl.replace(/\/$/, '');
  const http = createHttpClient({ baseUrl: normalizedBaseUrl, withCredentials: true });

  return {
    getAuthSession() {
      return http.get<PublicAuthSession>('/auth/session');
    },

    getGoogleAuthUrl(returnTo = '/configurar') {
      const query = new URLSearchParams({ returnTo });
      return `${normalizedBaseUrl}/auth/google/start?${query}`;
    },

    logout() {
      return http.post<void>('/auth/logout');
    },

    listPublications(params: { page?: number; pageSize?: number; q?: string } = {}) {
      const qs = new URLSearchParams();
      if (params.page) qs.set('page', String(params.page));
      if (params.pageSize) qs.set('pageSize', String(params.pageSize));
      if (params.q) qs.set('q', params.q);
      const suffix = qs.toString() ? `?${qs}` : '';
      return http.get<Paginated<Publication>>(`/publications${suffix}`);
    },

    getPublication(slug: string) {
      return http.get<PublicationDetail>(`/publications/${encodeURIComponent(slug)}`);
    },

    /** Envía una solicitud. `turnstileToken` se valida server-side. */
    createRequest(input: CreateRequestInput) {
      return http.post<CreateRequestResult>('/requests', input);
    },

    checkFreeSlug(slug: string) {
      return http.get<FreeSlugAvailability>(`/free/slugs/${encodeURIComponent(slug)}`);
    },

    searchMapLocations(query: string) {
      const params = new URLSearchParams({ q: query.trim() });
      return http.get<MapSearchResult>(`/map/search?${params}`);
    },

    suggestMapLocations(
      query: string,
      bias?: { latitude: number; longitude: number },
    ) {
      const params = new URLSearchParams({ q: query.trim() });
      if (bias) {
        params.set('lat', bias.latitude.toFixed(6));
        params.set('lon', bias.longitude.toFixed(6));
      }
      return http.get<MapSearchResult>(`/map/suggest?${params}`);
    },

    reverseMapLocation(latitude: number, longitude: number) {
      const params = new URLSearchParams({
        lat: latitude.toFixed(6),
        lon: longitude.toFixed(6),
      });
      return http.get<MapReverseResult>(`/map/reverse?${params}`);
    },

    createFreeIntake(input: CreateFreeIntakeInput) {
      return http.post<CreateFreeIntakeResult>('/free', input);
    },

    uploadFreeIntakeImage(intakeId: string, file: File) {
      const form = new FormData();
      form.set('image', file);
      return http.post<FreeImageUploadResult>(`/free/${encodeURIComponent(intakeId)}/images`, form);
    },

    submitFreeIntake(intakeId: string, input: SubmitFreeIntakeInput = {}) {
      return http.post<SubmitFreeIntakeResult>(
        `/free/${encodeURIComponent(intakeId)}/submit`,
        input,
      );
    },

    getFreeIntakeStatus(intakeId: string) {
      return http.get<FreeIntakeStatusResult>(`/free/${encodeURIComponent(intakeId)}/status`);
    },

    getAccountOverview() {
      return http.get<AccountOverview>('/account');
    },

    markAccountNotificationRead(notificationId: string) {
      return http.patch<{ notification: AccountNotification }>(
        `/account/notifications/${encodeURIComponent(notificationId)}/read`,
      );
    },

    markAllAccountNotificationsRead() {
      return http.patch<{ updated: number }>('/account/notifications/read-all');
    },

    createTestPackageProposal(input: CreateTestPackageProposalInput) {
      return http.post<{ proposal: PublicPackageProposal }>('/payments/proposals', input);
    },

    createCommercialPackageIntake(input: CreatePackageIntakeInput, submissionKey: string) {
      return http.post<{ intake: PublicPackageIntake }>('/commercial-intakes', input, {
        headers: { 'Idempotency-Key': submissionKey },
      });
    },

    listCommercialPackageIntakes() {
      return http.get<{ intakes: PublicPackageIntake[] }>('/commercial-intakes');
    },

    acceptCommercialOffer(intakeId: string, offerId: string, termsVersion: string) {
      return http.post<{ offer: PublicCommercialOffer; billingOrders: PublicBillingOrder[] }>(
        `/commercial-intakes/${encodeURIComponent(intakeId)}/offers/${encodeURIComponent(offerId)}/accept`,
        { accepted: true, termsVersion },
      );
    },

    getBillingOrder(orderId: string) {
      return http.get<{ order: PublicBillingOrder }>(
        `/payments/orders/${encodeURIComponent(orderId)}`,
      );
    },

    createBillingCheckout(orderId: string) {
      return http.post<{ order: PublicBillingOrder }>(
        `/payments/orders/${encodeURIComponent(orderId)}/checkout`,
      );
    },

    reconcileBillingOrder(orderId: string) {
      return http.post<{ found: boolean; order: PublicBillingOrder }>(
        `/payments/orders/${encodeURIComponent(orderId)}/reconcile`,
      );
    },

    getPackageProposal(proposalId: string) {
      return http.get<{ proposal: PublicPackageProposal }>(
        `/payments/proposals/${encodeURIComponent(proposalId)}`,
      );
    },

    createPackageCheckout(proposalId: string) {
      return http.post<{ proposal: PublicPackageProposal }>(
        `/payments/proposals/${encodeURIComponent(proposalId)}/checkout`,
      );
    },

    reconcilePackagePayment(proposalId: string) {
      return http.post<{ found: boolean; proposal: PublicPackageProposal }>(
        `/payments/proposals/${encodeURIComponent(proposalId)}/reconcile`,
      );
    },

    getPackageSubscription(proposalId: string) {
      return http.get<{ subscription: PublicPackageSubscription | null }>(
        `/subscriptions/proposals/${encodeURIComponent(proposalId)}`,
      );
    },

    createPackageSubscription(proposalId: string) {
      return http.post<{ subscription: PublicPackageSubscription }>(
        `/subscriptions/proposals/${encodeURIComponent(proposalId)}`,
      );
    },

    reconcilePackageSubscription(subscriptionId: string) {
      return http.post<{ found: boolean; subscription: PublicPackageSubscription }>(
        `/subscriptions/${encodeURIComponent(subscriptionId)}/reconcile`,
      );
    },

    cancelPackageSubscription(subscriptionId: string) {
      return http.post<{ subscription: PublicPackageSubscription }>(
        `/subscriptions/${encodeURIComponent(subscriptionId)}/cancel`,
      );
    },

    getMaintenanceSubscription(workOrderId: string) {
      return http.get<{ subscription: PublicMaintenanceSubscription | null }>(
        `/maintenance-subscriptions/work-orders/${encodeURIComponent(workOrderId)}`,
      );
    },

    createMaintenanceSubscription(workOrderId: string) {
      return http.post<{ subscription: PublicMaintenanceSubscription }>(
        `/maintenance-subscriptions/work-orders/${encodeURIComponent(workOrderId)}`,
      );
    },

    reconcileMaintenanceSubscription(subscriptionId: string) {
      return http.post<{ found: boolean; subscription: PublicMaintenanceSubscription }>(
        `/maintenance-subscriptions/${encodeURIComponent(subscriptionId)}/reconcile`,
      );
    },

    cancelMaintenanceSubscription(subscriptionId: string) {
      return http.post<{ subscription: PublicMaintenanceSubscription }>(
        `/maintenance-subscriptions/${encodeURIComponent(subscriptionId)}/cancel`,
      );
    },
  };
}

export type PublicClient = ReturnType<typeof createPublicClient>;

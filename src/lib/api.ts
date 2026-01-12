// src/lib/api.ts
const API_BASE =
  process.env.NEXT_PUBLIC_API_BASE?.replace(/\/$/, "") ||
  "http://localhost:8000";

const TOKEN_KEY = "medaryx_token";

export function setToken(token: string) {
  if (typeof window === "undefined") return;
  localStorage.setItem(TOKEN_KEY, token);
}

export function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(TOKEN_KEY);
}

export function clearToken() {
  if (typeof window === "undefined") return;
  localStorage.removeItem(TOKEN_KEY);
}

export type Role = "guardian" | "doctor" | "patient" | "clinic_admin";
export type Scope = "immunizations" | "allergies" | "conditions" | "all";

type Consent = {
  id: string;
  patient_id: string;
  patient_public_id: string;
  grantee_email: string;
  scope: string;
  expires_at: string;
  revoked: boolean;
  created_at: string;
};

async function request<T>(
  path: string,
  options: RequestInit = {},
  auth: boolean = true
): Promise<T> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string> | undefined),
  };

  if (auth) {
    const token = getToken();
    if (token) headers["Authorization"] = `Bearer ${token}`;
  }

  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}`, {
      ...options,
      headers,
      // NOTE: keep default mode="cors"
    });
  } catch (e: any) {
    throw new Error(
      `Network/CORS error calling ${API_BASE}${path}. ` +
        `Check NEXT_PUBLIC_API_BASE and backend CORS. ` +
        (e?.message ? `(${e.message})` : "")
    );
  }

  const text = await res.text();
  let data: any = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }

  if (!res.ok) {
    const msg =
      data?.detail ||
      data?.message ||
      (typeof data === "string" ? data : null) ||
      `Request failed (${res.status})`;
    throw new Error(msg);
  }

  return data as T;
}

export const api = {
  // ======================
  // Auth
  // ======================
  register: (email: string, password: string, role: Role) =>
    request<{ access_token: string; token_type: string }>(
      "/auth/register",
      {
        method: "POST",
        body: JSON.stringify({ email, password, role }),
      },
      false
    ),

  login: (email: string, password: string, role: Role) =>
    request<{ access_token: string; token_type: string }>(
      "/auth/login",
      {
        method: "POST",
        body: JSON.stringify({ email, password, role }),
      },
      false
    ),

  // ======================
  // Guardian
  // ======================
  createPatient: () =>
    request<{ id: string; public_id: string; guardian_user_id: string; created_at: string }>(
      "/patients",
      { method: "POST", body: JSON.stringify({}) },
      true
    ),

  addPointer: (
    patientIdentifier: string,
    payload: {
      record_type: "immunization" | "allergy" | "condition";
      fhir_base_url: string;
      fhir_resource_type: string;
      fhir_resource_id: string;
      issuer: string;
    }
  ) =>
    request<{ status: string; pointer_id: string; patient_id: string; patient_public_id: string }>(
      `/patients/${encodeURIComponent(patientIdentifier)}/pointers`,
      { method: "POST", body: JSON.stringify(payload) },
      true
    ),

  // ======================
  // Consents
  // ======================
  grantConsent: (
    patientIdentifier: string,
    payload: { grantee_email: string; scope: Scope; expires_at: string }
  ) =>
    request<{ status: string; consent_id: string; patient_id: string; patient_public_id: string }>(
      `/consents/patients/${encodeURIComponent(patientIdentifier)}`,
      { method: "POST", body: JSON.stringify(payload) },
      true
    ),

  getConsentsForPatient: (patientIdentifier: string) =>
    request<{
      patient_id: string;
      patient_public_id: string;
      consents: Consent[];
    }>(`/consents/patients/${encodeURIComponent(patientIdentifier)}`, {}, true),

  // FIX for your Netlify build error: ConsentDashboard.tsx calls this
  getMyConsents: () =>
    request<{
      patient_id: string;
      patient_public_id: string;
      consents: Consent[];
    }>(`/consents/me`, {}, true),

  revokeConsent: (consentId: string) =>
    request<{ status: string; consent_id: string; already_revoked?: boolean }>(
      `/consents/${encodeURIComponent(consentId)}/revoke`,
      { method: "POST" },
      true
    ),

  // ======================
  // Doctor
  // ======================
  getRecords: (patientIdentifier: string, scope: Scope) =>
    request<{
      patient_id: string;
      patient_public_id?: string;
      scope: Scope;
      count: number;
      records: Array<{ issuer: string; pointer_id: string; resource: any }>;
    }>(
      `/records/patients/${encodeURIComponent(patientIdentifier)}?scope=${encodeURIComponent(scope)}`,
      {},
      true
    ),

  // ======================
  // Patient
  // ======================

  // IMPORTANT: This MUST be auth=true since your backend requires Bearer auth (401 otherwise)
  selfRegisterPatient: (date_of_birth: string) =>
    request<{ id: string; public_id: string; guardian_user_id: string; created_at: string }>(
      "/patients/self/register",
      { method: "POST", body: JSON.stringify({ date_of_birth }) },
      true
    ),

  getMyRecords: (scope: Scope) =>
    request<{
      patient_id: string;
      patient_public_id?: string;
      scope: Scope;
      count: number;
      records: Array<{ issuer: string; pointer_id: string; resource: any }>;
    }>(`/records/me?scope=${encodeURIComponent(scope)}`, {}, true),

  addMyPointer: (payload: { scope: Scope; fhir_resource_id: string; issuer?: string }) =>
    request<{ status: string; pointer_id: string; record_type: string }>(
      `/records/me/pointers`,
      { method: "POST", body: JSON.stringify(payload) },
      true
    ),

  createFromCatalog: (payload: { scope: Scope; display: string; issuer?: string }) =>
    request<{ status: string; fhir_resource_type: string; fhir_resource_id: string; pointer_id: string }>(
      `/records/me/catalog/create`,
      { method: "POST", body: JSON.stringify(payload) },
      true
    ),

    // ======================
  // Hospitals (CMS NPI Registry)
  // ======================
  searchHospitalsCMS: (params: {
    name: string;
    city?: string;
    state?: string;
    postal_code?: string;
    limit?: number;
    skip?: number;
  }) => {
    const qs = new URLSearchParams();
    qs.set("name", params.name);
    if (params.city) qs.set("city", params.city);
    if (params.state) qs.set("state", params.state);
    if (params.postal_code) qs.set("postal_code", params.postal_code);
    if (params.limit != null) qs.set("limit", String(params.limit));
    if (params.skip != null) qs.set("skip", String(params.skip));

    return request<{
      source: string;
      result_count: number;
      results: Array<{
        npi: string;
        name: string;
        enumeration_type: string;
        status: string;
        last_updated?: string;
        address?: {
          line1?: string;
          line2?: string;
          city?: string;
          state?: string;
          postal_code?: string;
          country_code?: string;
          telephone_number?: string;
        };
        taxonomies?: any[];
      }>;
    }>(`/hospitals/cms/search?${qs.toString()}`, {}, false);
  },

    // ======================
  // CMS NPI Registry (Providers / NPI-1)
  // ======================
  searchProvidersCMS: (payload: {
    first_name?: string;
    last_name?: string;
    city?: string;
    state?: string;
    postal_code?: string;
    limit?: number;
    skip?: number;
  }) => {
    const q = new URLSearchParams();
    if (payload.first_name) q.set("first_name", payload.first_name);
    if (payload.last_name) q.set("last_name", payload.last_name);
    if (payload.city) q.set("city", payload.city);
    if (payload.state) q.set("state", payload.state);
    if (payload.postal_code) q.set("postal_code", payload.postal_code);
    q.set("limit", String(payload.limit ?? 10));
    q.set("skip", String(payload.skip ?? 0));

    return request<{
      source: string;
      result_count: number;
      results: Array<{
        npi: string;
        name: string;
        status?: string;
        last_updated?: string;
        address?: {
          line1?: string;
          line2?: string | null;
          city?: string;
          state?: string;
          postal_code?: string;
          country_code?: string;
          telephone_number?: string;
        };
        taxonomy?: { code?: string; desc?: string; primary?: boolean };
        raw?: any;
      }>;
    }>(`/providers/cms/search?${q.toString()}`, {}, true);
  },



    // ======================
  // Patient hospital selection
  // ======================
  getMyHospitalSelection: () =>
    request<
      | null
      | {
          hospital_npi: string;
          hospital_name: string;
          hospital_phone?: string | null;
          address_line1?: string | null;
          address_line2?: string | null;
          city?: string | null;
          state?: string | null;
          postal_code?: string | null;
          taxonomy_desc?: string | null;
        }
    >(`/patients/me/hospital`, {}, true),

  setMyHospitalSelection: (payload: {
    npi: string;
    name: string;
    telephone_number?: string | null;
    line1?: string | null;
    line2?: string | null;
    city?: string | null;
    state?: string | null;
    postal_code?: string | null;
    taxonomy_desc?: string | null;
  }) =>
    request<{
      hospital_npi: string;
      hospital_name: string;
      hospital_phone?: string | null;
      address_line1?: string | null;
      address_line2?: string | null;
      city?: string | null;
      state?: string | null;
      postal_code?: string | null;
      taxonomy_desc?: string | null;
    }>(`/patients/me/hospital`, { method: "POST", body: JSON.stringify(payload) }, true),


  // ======================
  // Provider selection (Patient)
  // ======================
  getMyProviderSelection: () =>
    request<{ selected: any | null }>(`/providers/me`, {}, true),

  setMyProviderSelection: (payload: {
    npi: string;
    name: string;
    taxonomy_desc?: string | null;
    telephone_number?: string | null;
    line1?: string | null;
    line2?: string | null;
    city?: string | null;
    state?: string | null;
    postal_code?: string | null;
  }) =>
    request<{ status: string; selected?: { npi: string; name: string } }>(
      `/providers/me/select`,
      { method: "POST", body: JSON.stringify(payload) },
      true
    ),

  clearMyProviderSelection: () =>
    request<{ status: string; cleared: boolean }>(`/providers/me/clear`, { method: "POST" }, true),

  
};

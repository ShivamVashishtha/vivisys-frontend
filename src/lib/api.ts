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
};

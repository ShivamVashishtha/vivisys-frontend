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
export type Scope = "immunizations" | "allergies" | "conditions";

async function request<T>(
  path: string,
  options: RequestInit = {},
  auth: boolean = true
): Promise<T> {
  const headers: Record<string, string> = {
    Accept: "application/json",
    ...(options.headers ? (options.headers as Record<string, string>) : {}),
  };

  // Attach JSON content-type if body is present and caller didn't specify it
  if (options.body && !("Content-Type" in headers)) {
    headers["Content-Type"] = "application/json";
  }

  if (auth) {
    const token = getToken();
    if (token) headers["Authorization"] = `Bearer ${token}`;
  }

  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers,
  });

  // Parse response body (json preferred, fallback to text)
  let data: any = null;
  const ct = res.headers.get("content-type") || "";
  try {
    if (ct.includes("application/json")) data = await res.json();
    else data = await res.text();
  } catch {
    // ignore parse errors
  }

  if (!res.ok) {
    const msg =
      (data && typeof data === "object" && (data.detail || data.message)) ||
      (typeof data === "string" && data) ||
      `Request failed (${res.status})`;
    throw new Error(msg);
  }

  return data as T;
}

export const api = {
  // Auth
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

  // Guardian: create patient
  createPatient: (payload: { full_name: string; date_of_birth: string }) =>
    request<{ id: string; public_id: string; guardian_user_id: string; created_at: string }>(
      "/patients",
      {
        method: "POST",
        body: JSON.stringify(payload),
      },
      true
    ),

  // Guardian/Doctor/Patient: consents
  grantConsent: (
    patientPublicId: string,
    payload: { grantee_email: string; scope: Scope; expires_at: string }
  ) =>
    request<{ status: string; consent_id: string }>(
      `/consents/patients/${encodeURIComponent(patientPublicId)}`,
      {
        method: "POST",
        body: JSON.stringify(payload),
      },
      true
    ),

  listConsentsForPatient: (patientPublicId: string) =>
    request<{ consents: any[] }>(
      `/consents/patients/${encodeURIComponent(patientPublicId)}`,
      {},
      true
    ),

  // Doctor: fetch patient records (with consent)
  getPatientRecords: (patientIdentifier: string, scope: Scope) =>
    request<{
      patient_id: string;
      patient_public_id?: string;
      scope: Scope;
      count: number;
      records: Array<{ issuer: string; pointer_id: string; resource: any }>;
    }>(
      `/records/patients/${encodeURIComponent(
        patientIdentifier
      )}?scope=${encodeURIComponent(scope)}`,
      {},
      true
    ),

  // Patient self-access (requires patient login)
  selfRegisterPatient: (date_of_birth: string) =>
    request<{ id: string; public_id: string; guardian_user_id: string; created_at: string }>(
      "/patients/self/register",
      { method: "POST", body: JSON.stringify({ date_of_birth }) },
      true
    ),

  // Patient: fetch own records
  getMyRecords: (scope: Scope) =>
    request<{
      patient_id: string;
      patient_public_id?: string;
      scope: Scope;
      count: number;
      records: Array<{ issuer: string; pointer_id: string; resource: any }>;
    }>(`/records/me?scope=${encodeURIComponent(scope)}`, {}, true),

  // Patient: add pointer
  addMyPointer: (payload: { scope: Scope; fhir_resource_id: string; issuer?: string }) =>
    request<{ status: string; pointer_id: string; record_type: string }>(
      `/records/me/pointers`,
      { method: "POST", body: JSON.stringify(payload) },
      true
    ),

  // Patient: create + link from catalog
  createFromCatalog: (payload: { scope: Scope; display: string; issuer?: string }) =>
    request<{ status: string; fhir_resource_type: string; fhir_resource_id: string; pointer_id: string }>(
      `/records/me/catalog/create`,
      { method: "POST", body: JSON.stringify(payload) },
      true
    ),
};

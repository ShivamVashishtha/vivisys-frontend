// frontend/src/lib/api.ts

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

type RequestErrorPayload =
  | { detail?: any; message?: any }
  | string
  | null
  | undefined;

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
    if (token) {
      // IMPORTANT: must be exactly "Bearer <jwt>"
      headers["Authorization"] = `Bearer ${token}`;
    }
  }

  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers,
  });

  const text = await res.text();

  let data: RequestErrorPayload = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text || null;
  }

  if (!res.ok) {
    const msg =
      (typeof data === "object" && data
        ? (data as any).detail || (data as any).message
        : null) ||
      (typeof data === "string" ? data : null) ||
      `Request failed (${res.status})`;
    throw new Error(msg);
  }

  // If no body, return null as T
  if (!text) return null as T;

  // If JSON, return JSON; otherwise return raw text
  try {
    return JSON.parse(text) as T;
  } catch {
    return text as unknown as T;
  }
}

export type Role = "guardian" | "doctor" | "patient" | "clinic_admin";
export type Scope = "immunizations" | "allergies" | "conditions";

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

  // Patient self-access (REQUIRES AUTH)
  selfRegisterPatient: (date_of_birth: string) =>
    request<{
      id: string;
      public_id: string;
      guardian_user_id: string;
      created_at: string;
    }>("/patients/self/register", {
      method: "POST",
      body: JSON.stringify({ date_of_birth }),
    }),

  // Patient records (REQUIRES AUTH)
  getMyRecords: (scope: Scope) =>
    request<{
      patient_id: string;
      patient_public_id?: string;
      scope: Scope;
      count: number;
      records: Array<{ issuer: string; pointer_id: string; resource: any }>;
    }>(`/records/me?scope=${encodeURIComponent(scope)}`),

  // Doctor (REQUIRES AUTH)
  getRecords: (patientIdentifier: string, scope: Scope) =>
    request<{
      patient_id: string;
      patient_public_id?: string;
      scope: Scope;
      count: number;
      records: Array<{ issuer: string; pointer_id: string; resource: any }>;
    }>(
      `/records/patients/${encodeURIComponent(
        patientIdentifier
      )}?scope=${encodeURIComponent(scope)}`
    ),
};

"use client";

import { useEffect, useMemo, useState } from "react";
import { api, clearToken, getToken, setToken, Scope } from "@/lib/api";
import { useRouter } from "next/navigation";
import AppShell from "@/app/_components/AppShell";
import ConsentDashboard from "@/app/_components/ConsentDashboard";

const CATALOG = {
  immunizations: ["Polio", "MMR", "Hepatitis B", "Tdap", "Varicella", "Influenza", "COVID-19", "HPV"],
  conditions: ["Asthma", "Diabetes mellitus", "Hypertension", "Migraine", "Anxiety disorder"],
  allergies: ["Peanut", "Penicillin", "Latex", "Shellfish", "Pollen"],
} as const;

type RecordItem = {
  issuer: string;
  pointer_id: string;
  resource: any;
};

type CMSHospital = {
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
  taxonomies?: Array<{
    code?: string;
    desc?: string;
    primary?: boolean;
    state?: string;
  }>;
};

function formatAddress(a?: CMSHospital["address"]) {
  if (!a) return "—";
  const parts = [
    a.line1,
    a.line2 || undefined,
    [a.city, a.state, a.postal_code].filter(Boolean).join(", "),
  ].filter(Boolean);
  return parts.join(" · ");
}

function primaryTaxonomy(h: CMSHospital) {
  const tx = h.taxonomies || [];
  const primary = tx.find((t) => t.primary) || tx[0];
  return primary?.desc || primary?.code || "—";
}


function formatDate(s?: string) {
  if (!s) return "—";
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return s;
  return d.toLocaleDateString();
}

function resourceSummary(resource: any) {
  const rt = resource?.resourceType ?? "Resource";
  if (rt === "Immunization") {
    return {
      type: resource?.vaccineCode?.text ?? "Immunization",
      status: resource?.status ?? "—",
      date: formatDate(resource?.occurrenceDateTime),
      id: resource?.id ?? "—",
    };
  }
  if (rt === "AllergyIntolerance") {
    return {
      type: resource?.code?.text ?? "Allergy",
      status:
        resource?.clinicalStatus?.text ??
        resource?.clinicalStatus?.coding?.[0]?.code ??
        "—",
      date: formatDate(resource?.recordedDate),
      id: resource?.id ?? "—",
    };
  }
  if (rt === "Condition") {
    return {
      type: resource?.code?.text ?? "Condition",
      status:
        resource?.clinicalStatus?.text ??
        resource?.clinicalStatus?.coding?.[0]?.code ??
        "—",
      date: formatDate(resource?.recordedDate ?? resource?.onsetDateTime),
      id: resource?.id ?? "—",
    };
  }
  return {
    type: rt,
    status: resource?.status ?? "—",
    date: formatDate(resource?.meta?.lastUpdated),
    id: resource?.id ?? "—",
  };
}

function defaultExpiresLocal(): string {
  const d = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  return d.toISOString().slice(0, 16);
}

// Best-effort way to detect auth failures from your backend messages
function isAuthErrorMessage(msg?: string) {
  const m = (msg || "").toLowerCase();
  return (
    m.includes("not authenticated") ||
    m.includes("unauthorized") ||
    m.includes("401") ||
    m.includes("invalid token") ||
    m.includes("token")
  );
}

function summarizeForHeader(resource: any) {
  const rt = resource?.resourceType ?? "Resource";

  const base = {
    resourceType: rt,
    id: resource?.id ?? "—",
    status:
      resource?.status ??
      resource?.clinicalStatus?.text ??
      resource?.clinicalStatus?.coding?.[0]?.code ??
      "—",
    date:
      resource?.occurrenceDateTime ??
      resource?.recordedDate ??
      resource?.onsetDateTime ??
      resource?.meta?.lastUpdated ??
      "",
    title:
      resource?.vaccineCode?.text ??
      resource?.code?.text ??
      resource?.medicationCodeableConcept?.text ??
      rt,
  };

  return {
    ...base,
    dateLabel: formatDate(base.date),
  };
}

async function copyText(label: string, value: string, onMsg?: (m: string) => void) {
  try {
    await navigator.clipboard.writeText(value);
    onMsg?.(`✅ Copied ${label}`);
  } catch {
    onMsg?.(`❌ Could not copy ${label}`);
  }
}


export default function PatientPage() {
  const router = useRouter();

  // ===== Auth (NEW) =====
  const [authed, setAuthed] = useState<boolean>(false);
  const [email, setEmail] = useState<string>("patient@test.com");
  const [password, setPassword] = useState<string>("patient123");

  // Self-registration
  const [dob, setDob] = useState("1990-01-01");
  const [profile, setProfile] = useState<{ id: string; public_id: string } | null>(null);

  // Records
  const [scope, setScope] = useState<Scope>("immunizations");
  const [result, setResult] = useState<any>(null);
  const [selected, setSelected] = useState<number>(0);

  // Global error / loading
  const [err, setErr] = useState<string>("");
  const [loading, setLoading] = useState(false);

  // Consent grant form (patient -> doctor)
  const [doctorEmail, setDoctorEmail] = useState("doctor@test.com");
  const [consentScope, setConsentScope] = useState<Scope>("immunizations");
  const [expiresLocal, setExpiresLocal] = useState(defaultExpiresLocal());
  const [consentMsg, setConsentMsg] = useState<string>("");

  const [ptrScope, setPtrScope] = useState<Scope>("immunizations");
  const [ptrFhirId, setPtrFhirId] = useState("");
  const [ptrIssuer, setPtrIssuer] = useState("Self (Patient)");
  const [ptrMsg, setPtrMsg] = useState("");

    // Selected hospital (persisted on backend)
  const [hospitalSource, setHospitalSource] = useState<{ name: string; npi?: string } | null>(null);
  
  // Modal UI
  const [hospitalModalOpen, setHospitalModalOpen] = useState(false);
  const [hName, setHName] = useState("");
  const [hCity, setHCity] = useState("");
  const [hState, setHState] = useState("");
  const [hPostal, setHPostal] = useState("");
  const [hLoading, setHLoading] = useState(false);
  const [hErr, setHErr] = useState("");
  const [hResults, setHResults] = useState<CMSHospital[]>([]);


  const [catScope, setCatScope] = useState<"immunizations" | "conditions" | "allergies">("immunizations");
  const [catItem, setCatItem] = useState<string>(CATALOG.immunizations[0]);
  const [catIssuer, setCatIssuer] = useState("Self (Patient)");

  const [sourceMode, setSourceMode] = useState<"hospital" | "other">("hospital");

  const [catMsg, setCatMsg] = useState("");

  const [detailMsg, setDetailMsg] = useState<string>("");

  const records: RecordItem[] = useMemo(() => result?.records ?? [], [result]);
  const selectedRecord = records[selected];

  useEffect(() => {
    setAuthed(!!getToken());
  
    (async () => {
      try {
        const h = await api.getMyHospitalSelection();
        if (h) {
          setHospitalSource({
            name: h.hospital_name,
            npi: h.hospital_npi,
          });
          setCatIssuer(h.hospital_name);
          setPtrIssuer(h.hospital_name);
        }
      } catch {
        // ignore
      }
    })();
  }, []);


  function handleAuthFailure(message?: string) {
    clearToken();
    setAuthed(false);
    setProfile(null);
    setResult(null);
    setSelected(0);
    setErr(message || "Not authenticated. Please log in again.");
  }

  async function logout() {
    clearToken();
    setAuthed(false);
    setProfile(null);
    setResult(null);
    router.push("/login");
  }

  async function searchHospitals() {
  setHErr("");
  setHResults([]);

  if (!hName.trim() || hName.trim().length < 2) {
    setHErr("Enter at least 2 characters in Hospital name.");
    return;
  }

  setHLoading(true);
  try {
    const res = await api.searchHospitalsCMS({
      name: hName.trim(),
      city: hCity.trim() || undefined,
      state: hState.trim() ? hState.trim().toUpperCase() : undefined,
      postal_code: hPostal.trim() || undefined,
      limit: 25,
      skip: 0,
    });

    const results = (res.results || []).sort((a: any, b: any) => {
      const ah = String(primaryTaxonomy(a)).toLowerCase().includes("hospital") ? 0 : 1;
      const bh = String(primaryTaxonomy(b)).toLowerCase().includes("hospital") ? 0 : 1;
      return ah - bh;
    });

    setHResults(results);
    if (!results.length) setHErr("No matches found. Try a broader name or remove filters.");
  } catch (e: any) {
    setHErr(e?.message ?? "Search failed");
  } finally {
    setHLoading(false);
  }
}

async function selectHospital(h: CMSHospital) {
  setHErr("");
  try {
    await api.setMyHospitalSelection({
      npi: h.npi,
      name: h.name,
      telephone_number: h.address?.telephone_number ?? null,
      line1: h.address?.line1 ?? null,
      line2: h.address?.line2 ?? null,
      city: h.address?.city ?? null,
      state: h.address?.state ?? null,
      postal_code: h.address?.postal_code ?? null,
      taxonomy_desc: primaryTaxonomy(h),
    });

    setHospitalSource({ name: h.name, npi: h.npi });
    setHospitalModalOpen(false);
  } catch (e: any) {
    setHErr(e?.message ?? "Could not save hospital selection");
  }
}

  // ===== NEW: Patient login =====
  async function loginPatient() {
    setErr("");
    setConsentMsg("");
    setPtrMsg("");
    setCatMsg("");
    setLoading(true);
    try {
      const res = await api.login(email.trim(), password, "patient");
      setToken(res.access_token);
      setAuthed(true);
    } catch (e: any) {
      const msg = e?.message ?? "Failed";
      if (isAuthErrorMessage(msg)) handleAuthFailure(msg);
      else setErr(msg);
    } finally {
      setLoading(false);
    }
  }

  function requireAuth() {
    const t = getToken();
    if (!t) {
      setErr("Not authenticated. Please log in as a PATIENT first (top of page).");
      return false;
    }
    return true;
  }

  async function registerSelf() {
    setErr("");
    setConsentMsg("");
    setLoading(true);
    try {
      if (!requireAuth()) return;

      const p = await api.selfRegisterPatient(dob);
      setProfile({ id: p.id, public_id: p.public_id });
    } catch (e: any) {
      const msg = e?.message ?? "Failed";
      if (isAuthErrorMessage(msg)) handleAuthFailure(msg);
      else setErr(msg);
    } finally {
      setLoading(false);
    }
  }

  async function fetchMyRecords() {
    setErr("");
    setConsentMsg("");
    setResult(null);
    setSelected(0);
    setLoading(true);
    try {
      if (!requireAuth()) return;

      const res = await api.getMyRecords(scope);
      setResult(res);
      if (res?.patient_public_id) {
        setProfile({ id: res.patient_id, public_id: res.patient_public_id });
      }
    } catch (e: any) {
      const msg = e?.message ?? "Failed";
      if (isAuthErrorMessage(msg)) handleAuthFailure(msg);
      else setErr(msg);
    } finally {
      setLoading(false);
    }
  }

  async function grantDoctorAccess() {
    setErr("");
    setConsentMsg("");
    setLoading(true);
    try {
      if (!requireAuth()) return;
      if (!profile?.public_id) throw new Error("Register yourself first (DOB) to get a Patient ID.");

      const expiresAt = expiresLocal
        ? new Date(expiresLocal).toISOString()
        : new Date(Date.now() + 7 * 86400000).toISOString();

      await api.grantConsent(profile.public_id, {
        grantee_email: doctorEmail.trim(),
        scope: consentScope,
        expires_at: expiresAt,
      });

      setConsentMsg(
        `✅ Consent granted to ${doctorEmail} for ${consentScope} (expires ${new Date(expiresAt).toLocaleString()})`
      );
    } catch (e: any) {
      const msg = e?.message ?? "Failed";
      if (isAuthErrorMessage(msg)) handleAuthFailure(msg);
      else setErr(msg);
    } finally {
      setLoading(false);
    }
  }

  async function createAndLinkFromCatalog() {
    setErr("");
    setCatMsg("");
    setLoading(true);
    try {
      if (!requireAuth()) return;

      const res = await api.createFromCatalog({
        scope: catScope,
        display: catItem,
        issuer: catIssuer,
      });
      setCatMsg(`✅ Created ${res.fhir_resource_type}/${res.fhir_resource_id} and linked pointer.`);
    } catch (e: any) {
      const msg = e?.message ?? "Failed";
      if (isAuthErrorMessage(msg)) handleAuthFailure(msg);
      else setErr(msg);
    } finally {
      setLoading(false);
    }
  }

  async function addMyPointer() {
    setErr("");
    setPtrMsg("");
    setLoading(true);
    try {
      if (!requireAuth()) return;

      await api.addMyPointer({
        scope: ptrScope,
        fhir_resource_id: ptrFhirId.trim(),
        issuer: ptrIssuer.trim() || "Self (Patient)",
      });
      setPtrMsg("✅ Pointer added. Now fetch records to see it.");
      setPtrFhirId("");
    } catch (e: any) {
      const msg = e?.message ?? "Failed";
      if (isAuthErrorMessage(msg)) handleAuthFailure(msg);
      else setErr(msg);
    } finally {
      setLoading(false);
    }
  }

  return (
    <AppShell
      title="My Records"
      subtitle="Self access (18+). Log in as a patient, register your DOB once, then browse your records."
      activeNav="Records"
      onLogout={logout}
      right={
        <>
          <span className="pill">{authed ? "Authenticated" : "Not authenticated"}</span>
          {profile?.public_id ? (
            <span className="pill">Patient: {profile.public_id}</span>
          ) : (
            <span className="pill">Not registered</span>
          )}
          <span className="pill">Scope: {scope}</span>
        </>
      }
    >
      {/* ===== NEW: Patient login card ===== */}
      <div className="card" id="login">
        <div className="card-h">
          <div className="text-sm font-semibold">Patient login</div>
          <div className="text-xs text-slate-500">
            You must log in as a <span className="font-mono">patient</span> before self registration or viewing records.
          </div>
        </div>

        <div className="card-b grid gap-3">
          <div className="grid grid-cols-1 md:grid-cols-[1fr_1fr_180px] gap-2 items-end">
            <div>
              <div className="label">Email</div>
              <input className="input mt-2" value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>

            <div>
              <div className="label">Password</div>
              <input
                className="input mt-2"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>

            <button className="btn-primary" disabled={loading} onClick={loginPatient}>
              {loading ? "Working..." : authed ? "Re-login" : "Login"}
            </button>
          </div>

          <div className="text-xs text-slate-500">
            Tip: If you registered as guardian/doctor earlier, you still need a separate patient user to self-register.
          </div>

          {err ? (
            <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{err}</div>
          ) : null}
        </div>
      </div>

      {/* Self registration */}
      <div className="card" id="patients">
        <div className="card-h">
          <div className="text-sm font-semibold">Self registration</div>
          <div className="text-xs text-slate-500">Link your patient profile to this login. You must be 18+.</div>
        </div>

        <div className="card-b grid gap-3">
          <div className="grid grid-cols-1 md:grid-cols-[240px_180px_1fr] gap-2 items-end">
            <div>
              <div className="label">Date of Birth</div>
              <input className="input mt-2" type="date" value={dob} onChange={(e) => setDob(e.target.value)} />
            </div>

            <div className="flex gap-2">
              <button className="btn-primary w-full" disabled={loading} onClick={registerSelf}>
                {loading ? "Working..." : "Register"}
              </button>
            </div>

            <div className="text-sm text-slate-600">
              {profile ? (
                <>
                  Linked as <span className="font-mono">{profile.public_id}</span>
                </>
              ) : (
                "Not linked yet. Register to enable self-access."
              )}
            </div>
          </div>

          {/* keep error display here too (existing behavior) */}
          {err ? (
            <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{err}</div>
          ) : null}
        </div>
      </div>

      
      {/* Grant consent (Patient -> Doctor) */}
      <div className="card">
        <div className="card-h">
          <div className="text-sm font-semibold">Grant doctor access</div>
          <div className="text-xs text-slate-500">Create a time-bound consent for a doctor to view your records.</div>
        </div>

        <div className="card-b grid gap-3">
          <div className="grid grid-cols-1 md:grid-cols-[1fr_220px_240px_160px] gap-2 items-end">
            <div>
              <div className="label">Doctor email</div>
              <input
                className="input mt-2"
                value={doctorEmail}
                onChange={(e) => setDoctorEmail(e.target.value)}
                placeholder="doctor@test.com"
              />
            </div>

            <div>
              <div className="label">Scope</div>
              <select
                className="input mt-2"
                value={consentScope}
                onChange={(e) => setConsentScope(e.target.value as Scope)}
              >
                <option value="immunizations">immunizations</option>
                <option value="allergies">allergies</option>
                <option value="conditions">conditions</option>
              </select>
            </div>

            <div>
              <div className="label">Expires at</div>
              <input
                className="input mt-2"
                type="datetime-local"
                value={expiresLocal}
                onChange={(e) => setExpiresLocal(e.target.value)}
              />
            </div>

            <button className="btn-primary" disabled={loading} onClick={grantDoctorAccess}>
              {loading ? "Working..." : "Grant"}
            </button>
          </div>

          {consentMsg ? (
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">
              {consentMsg}
            </div>
          ) : null}
        </div>
      </div>

      {/* Consent dashboard */}
      <div id="consents">
        <ConsentDashboard mode="patient" />
      </div>

      {/* Hospital source */}
      <div className="card">
        <div className="card-h flex items-start justify-between gap-3">
          <div>
            <div className="text-sm font-semibold">Default hospital source</div>
            <div className="text-xs text-slate-500">
              Used as the source for new records unless you choose “Other / Self-reported”.
            </div>
          </div>
      
          <button
            className="btn-ghost"
            onClick={() => {
              setHErr("");
              setHResults([]);
              setHospitalModalOpen(true);
            }}
          >
            {hospitalSource ? "Change" : "Select"}
          </button>
        </div>
      
        <div className="card-b">
          {hospitalSource ? (
            <div key={hospitalSource.npi} className="grid gap-2 fade-in">
              <span className="pill-success">{hospitalSource.name}</span>
              {hospitalSource.npi ? <span className="pill">NPI: {hospitalSource.npi}</span> : null}
            </div>
          ) : (
            <div className="empty">No hospital selected. Select one to enable “Hospital” as a source.</div>
          )}
        </div>
      </div>

      
      {/* Add from catalog */}
      <div className="card">
        <div className="card-h">
          <div className="text-sm font-semibold">Add from catalog</div>
          <div className="text-xs text-slate-500">
            Pick a standard item (vaccine/condition/allergy). We will create the FHIR resource automatically and link it.
          </div>
        </div>

        <div className="card-b grid gap-3">
          <div className="grid grid-cols-1 md:grid-cols-[220px_1fr_1fr_160px] gap-2 items-end">
            <div>
              <div className="label">Category</div>
              <select
                className="input mt-2"
                value={catScope}
                onChange={(e) => {
                  const v = e.target.value as any;
                  setCatScope(v);
                  setCatItem((CATALOG as any)[v][0]);
                }}
              >
                <option value="immunizations">immunizations</option>
                <option value="conditions">conditions</option>
                <option value="allergies">allergies</option>
              </select>
            </div>

            <div>
              <div className="label">Pick item</div>
              <select className="input mt-2" value={catItem} onChange={(e) => setCatItem(e.target.value)}>
                {(CATALOG as any)[catScope].map((x: string) => (
                  <option key={x} value={x}>
                    {x}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <div className="label">Source</div>
            
              <select
                className="input mt-2"
                value={sourceMode}
                onChange={(e) => {
                  const v = e.target.value as "hospital" | "other";
                  setSourceMode(v);
                  if (v === "hospital" && hospitalSource) {
                    setCatIssuer(hospitalSource.name);
                  }
                }}
              >
                <option value="hospital" disabled={!hospitalSource}>
                  Hospital{hospitalSource ? ` (${hospitalSource.name})` : " (none selected)"}
                </option>
                <option value="other">Other / Self-reported</option>
              </select>
            
              {sourceMode === "other" && (
                <input
                  className="input mt-2"
                  placeholder="Enter source (e.g. Self, Clinic name)"
                  value={catIssuer}
                  onChange={(e) => setCatIssuer(e.target.value)}
                />
              )}
            </div>


            <button className="btn-primary" disabled={loading} onClick={createAndLinkFromCatalog}>
              {loading ? "Working..." : "Create & Link"}
            </button>
          </div>

          {catMsg ? (
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">{catMsg}</div>
          ) : null}
        </div>
      </div>

      {/* Add my pointer */}
      <div className="card">
        <div className="card-h">
          <div className="text-sm font-semibold">Add my record pointer</div>
          <div className="text-xs text-slate-500">
            Adds a pointer to your own FHIR record (HAPI FHIR). Then you can fetch and view it.
          </div>
        </div>

        <div className="card-b grid gap-3">
          <div className="grid grid-cols-1 md:grid-cols-[220px_1fr_1fr_160px] gap-2 items-end">
            <div>
              <div className="label">Scope</div>
              <select className="input mt-2" value={ptrScope} onChange={(e) => setPtrScope(e.target.value as Scope)}>
                <option value="immunizations">immunizations</option>
                <option value="allergies">allergies</option>
                <option value="conditions">conditions</option>
              </select>
            </div>

            <div>
              <div className="label">FHIR Resource ID</div>
              <input
                className="input mt-2"
                value={ptrFhirId}
                onChange={(e) => setPtrFhirId(e.target.value)}
                placeholder='e.g. "1001"'
              />
            </div>

            <div>
              <div className="label">Source</div>
            
              <select
                className="input mt-2"
                value={sourceMode}
                onChange={(e) => {
                  const v = e.target.value as "hospital" | "other";
                  setSourceMode(v);
                  if (v === "hospital" && hospitalSource) {
                    setPtrIssuer(hospitalSource.name);
                  }
                }}
              >
                <option value="hospital" disabled={!hospitalSource}>
                  Hospital{hospitalSource ? ` (${hospitalSource.name})` : " (none selected)"}
                </option>
                <option value="other">Other / Self-reported</option>
              </select>
            
              {sourceMode === "other" && (
                <input
                  className="input mt-2"
                  placeholder="Enter source (e.g. Self, Clinic name)"
                  value={ptrIssuer}
                  onChange={(e) => setPtrIssuer(e.target.value)}
                />
              )}
            </div>


            <button className="btn-primary" disabled={loading} onClick={addMyPointer}>
              {loading ? "Working..." : "Add"}
            </button>
          </div>

          {ptrMsg ? (
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">
              {ptrMsg}
            </div>
          ) : null}
        </div>
      </div>

      {/* Fetch records */}
      <div className="card">
        <div className="card-h">
          <div className="text-sm font-semibold">Browse my records</div>
          <div className="text-xs text-slate-500">
            This calls <span className="font-mono">GET /records/me</span>.
          </div>
        </div>

        <div id="records" className="card-b grid grid-cols-1 md:grid-cols-[240px_160px] gap-2 items-end">
          <div>
            <div className="label">Scope</div>
            <select className="input mt-2" value={scope} onChange={(e) => setScope(e.target.value as Scope)}>
              <option value="immunizations">immunizations</option>
              <option value="allergies">allergies</option>
              <option value="conditions">conditions</option>
            </select>
          </div>

          <button className="btn-primary" disabled={loading} onClick={fetchMyRecords}>
            {loading ? "Fetching..." : "Fetch"}
          </button>
        </div>
      </div>

      {/* Results */}
      {result ? (
        <div className="grid grid-cols-1 lg:grid-cols-[1.2fr_1fr] gap-4">
          <div className="card overflow-hidden">
            <div className="card-h flex items-center justify-between">
              <div>
                <div className="text-sm font-semibold">Records</div>
                <div className="text-xs text-slate-500">
                  {result.patient_public_id ? (
                    <>
                      patient: <span className="font-mono">{result.patient_public_id}</span> ·{" "}
                    </>
                  ) : null}
                  {result.count} record(s)
                </div>
              </div>
              <span className="pill">{result.scope}</span>
            </div>

            <div className="overflow-auto">
              <table className="table">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Type</th>
                    <th>Status</th>
                    <th>Issuer</th>
                  </tr>
                </thead>
                <tbody>
                  {records.map((r, idx) => {
                    const s = resourceSummary(r.resource);
                    const active = idx === selected;
                    return (
                      <tr
                        key={r.pointer_id}
                        className={[
                          "border-b border-slate-100 cursor-pointer",
                          active ? "bg-slate-50" : "hover:bg-slate-50/60",
                        ].join(" ")}
                        onClick={() => setSelected(idx)}
                      >
                        <td className="whitespace-nowrap">{s.date}</td>
                        <td className="px-4 py-3">
                          <div className="font-medium text-slate-900">{s.type}</div>
                          <div className="text-xs text-slate-500">
                            {r.resource?.resourceType} / {s.id}
                          </div>
                        </td>
                        <td className="whitespace-nowrap">
                          <span className="pill">{s.status}</span>
                        </td>
                        <td className="px-4 py-3">
                          <div className="text-slate-900">{r.issuer}</div>
                          <div className="text-xs text-slate-500 font-mono">ptr:{r.pointer_id.slice(0, 8)}…</div>
                        </td>
                      </tr>
                    );
                  })}

                  {records.length === 0 ? (
                    <tr>
                      <td className="px-4 py-10 text-slate-500" colSpan={4}>
                        No records returned.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </div>

          <div className="card overflow-hidden">
            <div className="card-h">
              <div className="text-sm font-semibold">Record details</div>
              <div className="text-xs text-slate-500">
                {selectedRecord ? (
                  <>
                    issuer: <span className="font-medium">{selectedRecord.issuer}</span> · pointer:{" "}
                    <span className="font-mono">{selectedRecord.pointer_id}</span>
                  </>
                ) : (
                  "Select a record to view details."
                )}
              </div>
            </div>

          <div className="p-4">
            {selectedRecord ? (
              <>
                {(() => {
                  const h = summarizeForHeader(selectedRecord.resource);
                  return (
                    <div className="mb-3 rounded-2xl border border-slate-200 bg-slate-50 p-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="text-sm font-semibold text-slate-900 truncate">
                            {h.title}
                          </div>
          
                          <div className="mt-1 flex flex-wrap gap-2 text-xs text-slate-600">
                            <span className="pill">{h.resourceType}</span>
                            <span className="pill">Status: {h.status}</span>
                            <span className="pill">Date: {h.dateLabel}</span>
                          </div>
          
                          <div className="mt-2 text-xs text-slate-600">
                            <span className="font-semibold">Issuer:</span>{" "}
                            <span className="text-slate-800">
                              {selectedRecord.issuer}
                            </span>
                          </div>
          
                          <div className="mt-1 text-xs text-slate-600">
                            <span className="font-semibold">FHIR ID:</span>{" "}
                            <span className="font-mono text-slate-800">{h.id}</span>
                          </div>
          
                          <div className="mt-1 text-xs text-slate-600">
                            <span className="font-semibold">Pointer:</span>{" "}
                            <span className="font-mono text-slate-800">
                              {selectedRecord.pointer_id}
                            </span>
                          </div>
                        </div>
          
                        <div className="flex flex-col gap-2 shrink-0">
                          <button
                            className="btn-ghost"
                            onClick={() =>
                              copyText("FHIR ID", String(h.id), setDetailMsg)
                            }
                          >
                            Copy FHIR ID
                          </button>
          
                          <button
                            className="btn-ghost"
                            onClick={() =>
                              copyText(
                                "JSON",
                                JSON.stringify(
                                  selectedRecord.resource,
                                  null,
                                  2
                                ),
                                setDetailMsg
                              )
                            }
                          >
                            Copy JSON
                          </button>
                        </div>
                      </div>
          
                      {detailMsg ? (
                        <div className="mt-2 text-xs text-slate-600">
                          {detailMsg}
                        </div>
                      ) : null}
                    </div>
                  );
                })()}
          
                <pre className="code h-[520px]">
                  {JSON.stringify(selectedRecord.resource, null, 2)}
                </pre>
              </>
            ) : (
              <div className="text-sm text-slate-600">No selection.</div>
            )}
          </div>
          </div>
        </div>
      ) : null}

      <div id="audit" />

    {hospitalModalOpen ? (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        {/* backdrop */}
        <div
          className="absolute inset-0 bg-black/30"
          onClick={() => setHospitalModalOpen(false)}
        />
    
        {/* panel */}
        <div className="relative w-full max-w-4xl rounded-3xl border border-slate-200 bg-white shadow-2xl overflow-hidden fade-im">
          <div className="p-4 border-b border-slate-100 flex items-start justify-between gap-3">
            <div>
              <div className="text-sm font-semibold">Find your hospital</div>
              <div className="text-xs text-slate-500">
                Search CMS NPI Registry by name, then narrow by city/state/ZIP.
              </div>
            </div>
            <button className="btn-ghost" onClick={() => setHospitalModalOpen(false)}>
              Close
            </button>
          </div>
    
          <div className="p-4 grid gap-3">
            <div className="grid grid-cols-1 md:grid-cols-[1fr_160px_110px_130px_140px] gap-2 items-end">
              <div>
                <div className="label">Hospital name</div>
                <input
                  className="input mt-2"
                  value={hName}
                  onChange={(e) => setHName(e.target.value)}
                  placeholder="Unity Hospital"
                />
              </div>
    
              <div>
                <div className="label">City</div>
                <input
                  className="input mt-2"
                  value={hCity}
                  onChange={(e) => setHCity(e.target.value)}
                  placeholder="Chicago"
                />
              </div>
    
              <div>
                <div className="label">State</div>
                <input
                  className="input mt-2"
                  value={hState}
                  onChange={(e) => setHState(e.target.value)}
                  placeholder="IL"
                />
              </div>
    
              <div>
                <div className="label">ZIP</div>
                <input
                  className="input mt-2"
                  value={hPostal}
                  onChange={(e) => setHPostal(e.target.value)}
                  placeholder="60611"
                />
              </div>
    
              <button className="btn-primary w-full" onClick={searchHospitals} disabled={hLoading}>
                {hLoading ? "Searching..." : "Search"}
              </button>
            </div>
    
            {hErr ? <div className="callout-warning">{hErr}</div> : null}
    
            <div className="rounded-2xl border border-slate-200 overflow-hidden">
              <div className="max-h-[420px] overflow-auto">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Hospital</th>
                      <th>Address</th>
                      <th>Type</th>
                      <th>NPI</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {hResults.length ? (
                      hResults.map((h) => {
                        const active = hospitalSource?.npi === h.npi;
                        return (
                          <tr key={h.npi}>
                            <td>
                              <div className="font-medium text-slate-900">{h.name}</div>
                              <div className="text-xs text-slate-500">
                                {h.address?.telephone_number ? `☎ ${h.address.telephone_number}` : " "}
                              </div>
                            </td>
                            <td className="text-slate-700">{formatAddress(h.address)}</td>
                            <td>
                              {String(primaryTaxonomy(h)).toLowerCase().includes("hospital") ? (
                                <span className="pill-success">{primaryTaxonomy(h)}</span>
                              ) : (
                                <span className="pill">{primaryTaxonomy(h)}</span>
                              )}
                            </td>
                            <td className="font-mono text-xs">{h.npi}</td>
                            <td className="text-right">
                              <button
                                className={active ? "btn-secondary" : "btn-primary"}
                                onClick={() => selectHospital(h)}
                              >
                                {active ? "Selected" : "Select"}
                              </button>
                            </td>
                          </tr>
                        );
                      })
                    ) : (
                      <tr>
                        <td colSpan={5} className="text-slate-500">
                          Enter a name and search to see results.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
    
              <div className="p-3 text-xs text-slate-500 border-t border-slate-100">
                Data source: CMS NPI Registry (NPI-2 organizations). Confirm using address/phone.
              </div>
            </div>
          </div>
        </div>
      </div>
    ) : null}

    </AppShell>
  );
}

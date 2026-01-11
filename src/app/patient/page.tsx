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

  const [catScope, setCatScope] = useState<"immunizations" | "conditions" | "allergies">("immunizations");
  const [catItem, setCatItem] = useState<string>(CATALOG.immunizations[0]);
  const [catIssuer, setCatIssuer] = useState("Self (Patient)");
  const [hospitalSource, setHospitalSource] = useState<{
  name: string;
  npi?: string;
} | null>(null);

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
                  value={catIssuer}
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
    </AppShell>
  );
}

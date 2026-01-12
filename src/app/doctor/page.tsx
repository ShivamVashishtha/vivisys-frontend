"use client";

import { useEffect, useMemo, useState } from "react";
import { api, clearToken, Scope } from "@/lib/api";
import { useRouter } from "next/navigation";
import AppShell from "@/app/_components/AppShell";


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
      status: resource?.clinicalStatus?.text ?? resource?.clinicalStatus?.coding?.[0]?.code ?? "—",
      date: formatDate(resource?.recordedDate),
      id: resource?.id ?? "—",
    };
  }
  if (rt === "Condition") {
    return {
      type: resource?.code?.text ?? "Condition",
      status: resource?.clinicalStatus?.text ?? resource?.clinicalStatus?.coding?.[0]?.code ?? "—",
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

function verificationFromIssuer(issuer: string) {
  const s = String(issuer || "").toLowerCase();

  // Heuristic rules (you can refine later)
  if (s.includes("self")) {
    return { label: "Patient-reported", tone: "warning" as const };
  }
  if (s.includes("http") || s.includes("fhir") || s.includes("hapi")) {
    return { label: "External pointer", tone: "danger" as const };
  }
  return { label: "Hospital-verified", tone: "success" as const };
}

function VerificationPill(props: { issuer: string }) {
  const v = verificationFromIssuer(props.issuer);
  if (v.tone === "success") return <span className="pill-success">{v.label}</span>;
  if (v.tone === "warning") return <span className="pill-warning">{v.label}</span>;
  return <span className="pill-danger">{v.label}</span>;
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


export default function DoctorPage() {
  const router = useRouter();
  const [snapLoading, setSnapLoading] = useState(false);
  const [snapErr, setSnapErr] = useState("");
  const [snapshot, setSnapshot] = useState<null | {
    immunizations: number;
    allergies: number;
    conditions: number;
    updatedAt: string;
  }>(null);

  const [patientId, setPatientId] = useState("");
  const [scope, setScope] = useState<Scope>("immunizations");
  const [result, setResult] = useState<any>(null);
  const [err, setErr] = useState<string>("");
  const [selected, setSelected] = useState<number>(0);
  const [loading, setLoading] = useState(false);
  
  const [detailMsg, setDetailMsg] = useState<string>("");
  const [noteDraft, setNoteDraft] = useState("");
  const [noteSavedMsg, setNoteSavedMsg] = useState("");

  const records: RecordItem[] = useMemo(() => result?.records ?? [], [result]);
  const selectedRecord = records[selected];

  async function fetchRecords() {
    setErr("");
    setResult(null);
    setSelected(0);
    setLoading(true);
    try {
      const res = await api.getRecords(patientId.trim(), scope);
      setResult(res);
    } catch (e: any) {
      setErr(e.message ?? "Failed");
    } finally {
      setLoading(false);
    }
  }

  async function fetchSnapshot() {
  const pid = patientId.trim();
  if (!pid) {
    setSnapErr("Enter a patient id first.");
    return;
  }

  setSnapLoading(true);
  setSnapErr("");

  try {
    const [im, al, co] = await Promise.all([
      api.getRecords(pid, "immunizations"),
      api.getRecords(pid, "allergies"),
      api.getRecords(pid, "conditions"),
    ]);

    const updatedAt = new Date().toLocaleString();
    setSnapshot({
      immunizations: im?.count ?? (im?.records?.length ?? 0),
      allergies: al?.count ?? (al?.records?.length ?? 0),
      conditions: co?.count ?? (co?.records?.length ?? 0),
      updatedAt,
    });
  } catch (e: any) {
    setSnapErr(e?.message ?? "Failed to load snapshot");
    setSnapshot(null);
  } finally {
    setSnapLoading(false);
  }
}

  
  function logout() {
    clearToken();
    router.push("/login");
  }

  function notesKey() {
  const pid = patientId.trim() || "unknown";
  return `vivisys_doctor_notes:${pid}`;
}

useEffect(() => {
  // Load note when patientId changes
  try {
    const raw = localStorage.getItem(notesKey());
    setNoteDraft(raw || "");
  } catch {
    setNoteDraft("");
  }
  setNoteSavedMsg("");
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, [patientId]);

function saveNote() {
  try {
    localStorage.setItem(notesKey(), noteDraft);
    setNoteSavedMsg("✅ Saved (private to this browser)");
    setTimeout(() => setNoteSavedMsg(""), 1500);
  } catch {
    setNoteSavedMsg("❌ Could not save");
  }
}

  
  return (
    <AppShell
      title="Doctor Console"
      subtitle="Search patient records by Patient ID + scope (consent required)."
      activeNav="Records"
      onLogout={logout}
      right={<span className="pill">Scope: {scope}</span>}
    >
      {/* Search */}
      <div className="card" id="lookup">
        <div className="card-h">
          <div className="text-sm font-semibold">Lookup</div>
          <div className="text-xs text-slate-500">
            Provide a Patient Global ID. Access is enforced by consent on the backend.
          </div>
        </div>
        {/* Cross-scope snapshot */}
        <div className="card">
          <div className="card-h">
            <div>
              <div className="text-sm font-semibold">Patient snapshot</div>
              <div className="text-xs text-slate-500">
                One-glance counts across scopes (consent still enforced per scope).
              </div>
            </div>
        
            <button className="btn-ghost" onClick={fetchSnapshot} disabled={snapLoading}>
              {snapLoading ? "Loading..." : "Refresh snapshot"}
            </button>
          </div>
        
          <div className="card-b">
            {snapErr ? <div className="callout-warning">{snapErr}</div> : null}
        
            {snapshot ? (
              <div className="flex flex-wrap gap-2 items-center">
                <span className="pill-success">Immunizations: {snapshot.immunizations}</span>
                <span className="pill-success">Allergies: {snapshot.allergies}</span>
                <span className="pill-success">Conditions: {snapshot.conditions}</span>
                <span className="pill">Updated: {snapshot.updatedAt}</span>
              </div>
            ) : (
              <div className="empty">
                Click <span className="font-medium">Refresh snapshot</span> after entering a patient id.
              </div>
            )}
          </div>
        </div>

        <div className="card-b grid gap-3">
          <div className="grid grid-cols-1 md:grid-cols-[1fr_240px_140px] gap-2">
            <div>
              <div className="label">Patient ID</div>
              <input
                className="input mt-2"
                value={patientId}
                onChange={(e) => setPatientId(e.target.value)}
                placeholder="Paste Patient Global ID"
              />
            </div>

            <div>
              <div className="label">Scope</div>
              <select
                className="input mt-2"
                value={scope}
                onChange={(e) => setScope(e.target.value as Scope)}
              >
                <option value="immunizations">immunizations</option>
                <option value="allergies">allergies</option>
                <option value="conditions">conditions</option>
              </select>
            </div>

            <div className="flex items-end">
              <button className="btn-primary w-full" onClick={fetchRecords} disabled={loading}>
                {loading ? "Fetching..." : "Fetch"}
              </button>
            </div>
          </div>

          {err ? (
            <div className="callout-warning">
              <div className="font-semibold">Request failed</div>
              <div className="mt-1">{err}</div>
              <div className="mt-2 text-xs opacity-80">
                If this is a 403, ask the patient to grant consent for this scope (or scope: all).
              </div>
            </div>
          ) : null}
        </div>
      </div>

      {/* Results */}
      {result ? (
        <div id="records" className="grid grid-cols-1 lg:grid-cols-[1.2fr_1fr] gap-4">

          {/* Table */}
          <div className="card overflow-hidden">
            <div className="card-h flex items-center justify-between">
              <div>
                <div className="text-sm font-semibold">Records</div>
                <div className="text-xs text-slate-500">
                  patient_id: <span className="font-mono">{result.patient_id}</span> ·{" "}
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
                          <div className="flex items-center justify-between gap-2">
                            <div className="text-slate-900">{r.issuer}</div>
                            <VerificationPill issuer={r.issuer} />
                          </div>
                          <div className="text-xs text-slate-500 font-mono">
                            ptr:{r.pointer_id.slice(0, 8)}…
                          </div>
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

          {/* Details */}
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
                {/* Private clinical notes (does not modify patient data) */}
                  <div className="mb-3 rounded-2xl border border-slate-200 bg-white p-3">
                    <div className="flex items-center justify-between gap-2">
                      <div className="text-sm font-semibold text-slate-900">Private clinical notes</div>
                      <button className="btn-ghost" onClick={saveNote}>
                        Save
                      </button>
                    </div>
                  
                    <div className="text-xs text-slate-500 mt-1">
                      Stored locally in your browser. Not written to the patient’s record.
                    </div>
                  
                    <textarea
                      className="input mt-3 min-h-[110px]"
                      value={noteDraft}
                      onChange={(e) => setNoteDraft(e.target.value)}
                      placeholder="Assessment / reminder / follow-up…"
                    />
                  
                    {noteSavedMsg ? <div className="mt-2 text-xs text-slate-600">{noteSavedMsg}</div> : null}
                  </div>

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
    </AppShell>
  );
}

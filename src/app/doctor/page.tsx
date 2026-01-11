"use client";

import { useMemo, useState } from "react";
import { api, clearToken, Scope } from "@/lib/api";
import { useRouter } from "next/navigation";
import AppShell from "@/app/_components/AppShell";
import RecordsViewer from "@/app/_components/RecordsViewer";


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

export default function DoctorPage() {
  const router = useRouter();

  const [patientId, setPatientId] = useState("");
  const [scope, setScope] = useState<Scope>("immunizations");
  const [result, setResult] = useState<any>(null);
  const [err, setErr] = useState<string>("");
  const [selected, setSelected] = useState<number>(0);
  const [loading, setLoading] = useState(false);

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

  function logout() {
    clearToken();
    router.push("/login");
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
      <div className="card">
        <div className="card-h">
          <div className="text-sm font-semibold">Lookup</div>
          <div className="text-xs text-slate-500">
            Provide a Patient Global ID. Access is enforced by consent on the backend.
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
            <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              {err}
            </div>
          ) : null}
        </div>
      </div>

      {/* Results */}
      {result ? (
        <RecordsViewer
          records={result.records}
          scope={result.scope}
          patientPublicId={result.patient_public_id}
        />
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
                <pre className="h-[520px] overflow-auto rounded-2xl border border-slate-200 bg-slate-950 text-slate-100 p-4 text-xs leading-relaxed">
{JSON.stringify(selectedRecord.resource, null, 2)}
                </pre>
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

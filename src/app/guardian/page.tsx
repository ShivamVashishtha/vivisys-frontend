"use client";

import { useMemo, useState } from "react";
import { api, clearToken, Scope } from "@/lib/api";
import { useRouter } from "next/navigation";
import AppShell from "@/app/_components/AppShell";
import ConsentDashboard from "@/app/_components/ConsentDashboard";

export default function GuardianPage() {
  const router = useRouter();

  // IMPORTANT: store the patient IDENTIFIER that backend routes accept.
  // We'll use public_id (readable) instead of the internal UUID.
  const [patientIdentifier, setPatientIdentifier] = useState<string>("");
  const [msg, setMsg] = useState<string>("");

  // Pointer form
  const [fhirId, setFhirId] = useState("");
  const [issuer, setIssuer] = useState("Hospital A (Demo)");

  // Consent form
  const [doctorEmail, setDoctorEmail] = useState("doctor@test.com");
  const [scope, setScope] = useState<Scope>("immunizations");
  const [days, setDays] = useState(7);

  const patientReady = useMemo(() => patientIdentifier.trim().length > 0, [patientIdentifier]);

  async function createPatient() {
    setMsg("");
    try {
      const p = await api.createPatient(); // expected: { id, public_id, ... }
      setPatientIdentifier(p.public_id ?? p.id);
      setMsg(`✅ Created patient: ${p.public_id ?? p.id}`);
    } catch (e: any) {
      setMsg(`❌ ${e.message ?? "Failed to create patient"}`);
    }
  }

  async function addPointer() {
    setMsg("");
    if (!patientReady) return setMsg("Create or paste a Patient ID first.");
    if (!fhirId.trim()) return setMsg("Paste a FHIR Immunization resource id first.");

    try {
      await api.addPointer(patientIdentifier, {
        record_type: "immunization",
        fhir_base_url: "http://localhost:8080/fhir",
        fhir_resource_type: "Immunization",
        fhir_resource_id: fhirId.trim(),
        issuer: issuer.trim() || "Unknown Issuer",
      });

      setMsg("✅ Pointer added");
    } catch (e: any) {
      setMsg(`❌ ${e.message ?? "Failed to add pointer"}`);
    }
  }

  async function grantConsent() {
    setMsg("");
    if (!patientReady) return setMsg("Create or paste a Patient ID first.");

    try {
      const exp = new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();

      await api.grantConsent(patientIdentifier, {
        grantee_email: doctorEmail.trim(),
        scope,
        expires_at: exp,
      });

      setMsg(`✅ Consent granted (${scope})`);
    } catch (e: any) {
      setMsg(`❌ ${e.message ?? "Failed to grant consent"}`);
    }
  }

  function logout() {
    clearToken();
    router.push("/login");
  }

  async function copyPatientId() {
    if (!patientReady) return;
    await navigator.clipboard.writeText(patientIdentifier);
    setMsg("✅ Copied Patient ID to clipboard");
  }

  return (
    <AppShell
      title="Guardian Console"
      subtitle="Create patients, register pointers, and grant consent."
      activeNav="Patients"
      onLogout={logout}
      right={
        <>
          {patientReady ? <span className="pill">Patient loaded</span> : <span className="pill">No patient</span>}
        </>
      }
    >
      {/* Patient */}
      <div className="card" id="patients">
        <div className="card-h flex items-center justify-between">
          <div>
            <div className="text-sm font-semibold">Patient</div>
            <div className="text-xs text-slate-500">Use the readable Patient ID (public id) to share with doctors.</div>
          </div>
          <button className="btn-ghost" onClick={createPatient}>
            + Create Patient
          </button>
        </div>

        <div className="card-b grid gap-3">
          <div>
            <div className="label">Patient ID</div>
            <div className="mt-2 flex gap-2">
              <input
                className="input"
                value={patientIdentifier}
                onChange={(e) => setPatientIdentifier(e.target.value)}
                placeholder="Paste Patient ID (e.g. MED-XXXX-YYY)"
              />
              <button className="btn-ghost" onClick={copyPatientId} disabled={!patientReady}>
                Copy
              </button>
            </div>
          </div>

          <div className="text-xs text-slate-500">
            Next: add a pointer to a FHIR record, then grant consent to a doctor.
          </div>
        </div>
      </div>

      {/* Consents dashboard */}
      <div id="consents">
        {patientReady ? (
          <ConsentDashboard mode="guardian" patientIdentifier={patientIdentifier} />
        ) : (
          <div className="card">
            <div className="card-b text-sm text-slate-600">Load a patient first to view and revoke consents.</div>
          </div>
        )}
      </div>

      {/* Pointer */}
      <div className="card" id="records">
        <div className="card-h">
          <div className="text-sm font-semibold">Register record pointer</div>
          <div className="text-xs text-slate-500">
            Stores only a pointer (issuer + FHIR resource location). No PHI stored in this DB.
          </div>
        </div>

        <div className="card-b grid gap-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="md:col-span-1">
              <div className="label">FHIR Resource Type</div>
              <div className="mt-2 input bg-slate-50">Immunization</div>
            </div>

            <div className="md:col-span-1">
              <div className="label">FHIR Resource ID</div>
              <input
                className="input mt-2"
                value={fhirId}
                onChange={(e) => setFhirId(e.target.value)}
                placeholder='e.g. "1001"'
              />
            </div>

            <div className="md:col-span-1">
              <div className="label">Issuer</div>
              <input
                className="input mt-2"
                value={issuer}
                onChange={(e) => setIssuer(e.target.value)}
                placeholder="Hospital / Clinic name"
              />
            </div>
          </div>

          <div className="flex items-center justify-end gap-2">
            <button className="btn-ghost" onClick={() => setFhirId("")}>
              Clear
            </button>
            <button className="btn-primary" onClick={addPointer}>
              Add Pointer
            </button>
          </div>
        </div>
      </div>

      {/* Grant consent */}
      <div className="card">
        <div className="card-h">
          <div className="text-sm font-semibold">Grant consent</div>
          <div className="text-xs text-slate-500">Consent can be scoped, time-bound, and revoked.</div>
        </div>

        <div className="card-b grid gap-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="md:col-span-1">
              <div className="label">Doctor Email</div>
              <input
                className="input mt-2"
                value={doctorEmail}
                onChange={(e) => setDoctorEmail(e.target.value)}
                placeholder="doctor@example.com"
              />
            </div>

            <div className="md:col-span-1">
              <div className="label">Scope</div>
              <select className="input mt-2" value={scope} onChange={(e) => setScope(e.target.value as Scope)}>
                <option value="all">all</option>
                <option value="immunizations">immunizations</option>
                <option value="allergies">allergies</option>
                <option value="conditions">conditions</option>
              </select>
              <div className="text-xs text-slate-500 mt-1">
                Tip: <span className="font-medium">all</span> gives access to all record scopes.
              </div>
            </div>

            <div className="md:col-span-1">
              <div className="label">Expires</div>
              <div className="mt-2 flex items-center gap-2">
                <input
                  className="input"
                  type="number"
                  min={1}
                  value={days}
                  onChange={(e) => setDays(Number(e.target.value))}
                />
                <span className="text-sm text-slate-600">days</span>
              </div>
            </div>
          </div>

          <div className="flex items-center justify-end">
            <button className="btn-primary" onClick={grantConsent}>
              Grant Consent
            </button>
          </div>
        </div>
      </div>

      {/* Status */}
      {msg ? (
        <div className="card">
          <div className="card-b text-sm">{msg}</div>
        </div>
      ) : null}

      {/* Audit anchor placeholder for sidebar */}
      <div id="audit" />
    </AppShell>
  );
}

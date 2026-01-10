"use client";

import { useState } from "react";
import { api } from "@/lib/api";

function fmtDate(s: string) {
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return s;
  return d.toLocaleString();
}

function statusPill(revoked: boolean, expires_at: string) {
  if (revoked) return <span className="pill">Revoked</span>;
  const exp = new Date(expires_at);
  if (!Number.isNaN(exp.getTime()) && exp.getTime() < Date.now()) return <span className="pill">Expired</span>;
  return <span className="pill">Active</span>;
}

export default function ConsentDashboard(props: {
  mode: "guardian" | "patient";
  patientIdentifier?: string; // required for guardian mode
}) {
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string>("");
  const [data, setData] = useState<any>(null);

  async function load() {
    setErr("");
    setLoading(true);
    try {
      if (props.mode === "patient") {
        const res = await api.getMyConsents();
        setData(res);
      } else {
        if (!props.patientIdentifier) throw new Error("Enter a patient id/public id first.");
        const res = await api.getConsentsForPatient(props.patientIdentifier);
        setData(res);
      }
    } catch (e: any) {
      setErr(e.message ?? "Failed");
    } finally {
      setLoading(false);
    }
  }

  async function revoke(consentId: string) {
    setErr("");
    setLoading(true);
    try {
      await api.revokeConsent(consentId);
      await load();
    } catch (e: any) {
      setErr(e.message ?? "Failed");
    } finally {
      setLoading(false);
    }
  }

  const consents = data?.consents ?? [];

  return (
    <div className="card overflow-hidden">
      <div className="card-h flex items-center justify-between">
        <div>
          <div className="text-sm font-semibold">Consent Dashboard</div>
          <div className="text-xs text-slate-500">
            View active/expired/revoked access grants. Revoke any time.
          </div>
        </div>
        <button className="btn-primary" disabled={loading} onClick={load}>
          {loading ? "Loading..." : "Refresh"}
        </button>
      </div>

      <div className="card-b">
        {err ? (
          <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700 mb-3">
            {err}
          </div>
        ) : null}

        {data?.patient_public_id ? (
          <div className="mb-3 text-sm text-slate-600">
            Patient: <span className="font-mono">{data.patient_public_id}</span>
          </div>
        ) : null}

        <div className="overflow-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-white border-b border-slate-100">
              <tr className="text-left text-slate-600">
                <th className="px-4 py-3 font-semibold">Status</th>
                <th className="px-4 py-3 font-semibold">Doctor</th>
                <th className="px-4 py-3 font-semibold">Scope</th>
                <th className="px-4 py-3 font-semibold">Expires</th>
                <th className="px-4 py-3 font-semibold">Created</th>
                <th className="px-4 py-3 font-semibold">Action</th>
              </tr>
            </thead>
            <tbody>
              {consents.map((c: any) => (
                <tr key={c.id} className="border-b border-slate-100">
                  <td className="px-4 py-3">{statusPill(c.revoked, c.expires_at)}</td>
                  <td className="px-4 py-3">{c.grantee_email}</td>
                  <td className="px-4 py-3"><span className="pill">{c.scope}</span></td>
                  <td className="px-4 py-3">{fmtDate(c.expires_at)}</td>
                  <td className="px-4 py-3">{fmtDate(c.created_at)}</td>
                  <td className="px-4 py-3">
                    <button
                      className="btn-ghost"
                      disabled={loading || c.revoked}
                      onClick={() => revoke(c.id)}
                      title={c.revoked ? "Already revoked" : "Revoke consent"}
                    >
                      Revoke
                    </button>
                  </td>
                </tr>
              ))}
              {consents.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-10 text-slate-500">
                    No consents found. Click Refresh.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

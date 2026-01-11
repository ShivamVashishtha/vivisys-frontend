"use client";

import { useMemo, useState } from "react";

type RecordItem = {
  issuer: string;
  pointer_id: string;
  resource: any;
};

type Props = {
  records: RecordItem[];
  scope: string;
  patientPublicId?: string;
};

function formatDate(s?: string) {
  if (!s) return "—";
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return s;
  return d.toLocaleDateString();
}

function summarize(resource: any) {
  const rt = resource?.resourceType ?? "Resource";

  if (rt === "Immunization") {
    return {
      title: resource?.vaccineCode?.text ?? "Immunization",
      status: resource?.status ?? "—",
      date: formatDate(resource?.occurrenceDateTime),
      id: resource?.id ?? "—",
      type: rt,
    };
  }

  if (rt === "Condition") {
    return {
      title: resource?.code?.text ?? "Condition",
      status: resource?.clinicalStatus?.text ?? "—",
      date: formatDate(resource?.recordedDate ?? resource?.onsetDateTime),
      id: resource?.id ?? "—",
      type: rt,
    };
  }

  if (rt === "AllergyIntolerance") {
    return {
      title: resource?.code?.text ?? "Allergy",
      status: resource?.clinicalStatus?.text ?? "—",
      date: formatDate(resource?.recordedDate),
      id: resource?.id ?? "—",
      type: rt,
    };
  }

  return {
    title: rt,
    status: resource?.status ?? "—",
    date: formatDate(resource?.meta?.lastUpdated),
    id: resource?.id ?? "—",
    type: rt,
  };
}

export default function RecordsViewer({ records, scope, patientPublicId }: Props) {
  const [selected, setSelected] = useState<number>(0);
  const selectedRecord = records[selected];

  const rows = useMemo(
    () =>
      records.map((r) => ({
        ...summarize(r.resource),
        issuer: r.issuer,
        pointer_id: r.pointer_id,
        resource: r.resource,
      })),
    [records]
  );

  if (!records.length) {
    return (
      <div className="card">
        <div className="card-b empty">
          No records found for <span className="font-medium">{scope}</span>.
        </div>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[1.3fr_1fr] gap-4">
      {/* TABLE */}
      <div className="card overflow-hidden">
        <div className="card-h">
          <div>
            <div className="text-sm font-semibold">Records</div>
            <div className="text-xs text-slate-500">
              {patientPublicId ? (
                <>
                  patient: <span className="font-mono">{patientPublicId}</span> ·{" "}
                </>
              ) : null}
              {rows.length} item(s)
            </div>
          </div>
          <span className="pill">{scope}</span>
        </div>

        <div className="overflow-auto">
          <table className="table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Record</th>
                <th>Status</th>
                <th>Issuer</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, idx) => {
                const active = idx === selected;
                return (
                  <tr
                    key={r.pointer_id}
                    className={active ? "bg-slate-50" : ""}
                    onClick={() => setSelected(idx)}
                    style={{ cursor: "pointer" }}
                  >
                    <td>{r.date}</td>
                    <td>
                      <div className="font-medium text-slate-900">{r.title}</div>
                      <div className="text-xs text-slate-500">
                        {r.type} · ID {r.id}
                      </div>
                    </td>
                    <td>
                      <span className="pill">{r.status}</span>
                    </td>
                    <td>
                      <div>{r.issuer}</div>
                      <div className="text-xs text-slate-500 font-mono">
                        ptr:{r.pointer_id.slice(0, 8)}…
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* DETAILS */}
      <div className="card overflow-hidden">
        <div className="card-h">
          <div className="text-sm font-semibold">Record details</div>
          <div className="text-xs text-slate-500">
            {selectedRecord ? (
              <>
                issuer:{" "}
                <span className="font-medium">{selectedRecord.issuer}</span>
              </>
            ) : (
              "Select a record"
            )}
          </div>
        </div>

        <div className="p-4">
          {selectedRecord ? (
            <pre className="code h-[520px]">
{JSON.stringify(selectedRecord.resource, null, 2)}
            </pre>
          ) : (
            <div className="text-sm text-slate-600">No record selected.</div>
          )}
        </div>
      </div>
    </div>
  );
}

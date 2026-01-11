"use client";

import { useEffect, useMemo, useState } from "react";
import { api, clearToken } from "@/lib/api";
import { useRouter } from "next/navigation";
import AppShell from "@/app/_components/AppShell";

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

type CMSResponse = {
  source: string;
  result_count: number;
  results: CMSHospital[];
};

const SELECTED_HOSPITAL_KEY = "vivisys_selected_hospital";

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

function useDebouncedValue<T>(value: T, delayMs: number) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(t);
  }, [value, delayMs]);
  return debounced;
}

export default function PatientHospitalsPage() {
  const router = useRouter();

  // Search form
  const [name, setName] = useState("");
  const [city, setCity] = useState("");
  const [stateUS, setStateUS] = useState("");
  const [postal, setPostal] = useState("");

  // Results + selection
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  const [data, setData] = useState<CMSResponse | null>(null);
  const [selected, setSelected] = useState<CMSHospital | null>(null);

  // Optional: auto search while typing
  const debouncedName = useDebouncedValue(name, 350);
  const debouncedCity = useDebouncedValue(city, 350);
  const debouncedState = useDebouncedValue(stateUS, 350);
  const debouncedPostal = useDebouncedValue(postal, 350);

  const canSearch = useMemo(() => debouncedName.trim().length >= 2, [debouncedName]);

  useEffect(() => {
    (async () => {
      // 1️⃣ Try backend first (authoritative)
      try {
        const saved = await api.getMyHospitalSelection();
        if (saved) {
          const h: CMSHospital = {
            npi: saved.hospital_npi,
            name: saved.hospital_name,
            address: {
              line1: saved.address_line1 ?? undefined,
              line2: saved.address_line2 ?? undefined,
              city: saved.city ?? undefined,
              state: saved.state ?? undefined,
              postal_code: saved.postal_code ?? undefined,
              telephone_number: saved.hospital_phone ?? undefined,
            },
            taxonomies: saved.taxonomy_desc
              ? [{ desc: saved.taxonomy_desc, primary: true }]
              : [],
          };
          setSelected(h);
          return; // stop if backend has data
        }
      } catch {
        // ignore backend errors and fallback
      }
  
      // 2️⃣ Fallback to localStorage
      try {
        const raw = localStorage.getItem(SELECTED_HOSPITAL_KEY);
        if (raw) setSelected(JSON.parse(raw));
      } catch {
        // ignore
      }
    })();
  }, []);


  useEffect(() => {
    // Auto-search when inputs change (name must be present)
    if (!canSearch) {
      setData(null);
      setErr("");
      return;
    }
    void runSearch(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedName, debouncedCity, debouncedState, debouncedPostal]);

  async function runSearch(silent: boolean = false) {
    if (!name.trim() || name.trim().length < 2) {
      if (!silent) setErr("Enter at least 2 characters in Hospital name.");
      return;
    }

    setLoading(true);
    setErr("");

    try {
      const res = await api.searchHospitalsCMS({
        name: name.trim(),
        city: city.trim() || undefined,
        state: stateUS.trim() ? stateUS.trim().toUpperCase() : undefined,
        postal_code: postal.trim() || undefined,
        limit: 25,
        skip: 0,
      });

      // If you want “hospital-only” feel without backend changes:
      // prioritize results with taxonomy containing "Hospital"
      const results = (res.results || []).sort((a: any, b: any) => {
        const ah = String(primaryTaxonomy(a)).toLowerCase().includes("hospital") ? 0 : 1;
        const bh = String(primaryTaxonomy(b)).toLowerCase().includes("hospital") ? 0 : 1;
        return ah - bh;
      });

      setData({ ...res, results });
      if (!results.length && !silent) setErr("No matches found. Try a broader name or remove filters.");
    } catch (e: any) {
      setErr(e?.message ?? "Search failed");
      setData(null);
    } finally {
      setLoading(false);
    }
  }

  async function chooseHospital(h: CMSHospital) {
    setSelected(h);
  
    // keep local fallback (optional)
    try {
      localStorage.setItem(SELECTED_HOSPITAL_KEY, JSON.stringify(h));
    } catch {}
  
    // persist to backend (new)
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
    } catch (e: any) {
      setErr(e?.message ?? "Could not save hospital selection");
    }
  }


  function clearSelection() {
    setSelected(null);
    try {
      localStorage.removeItem(SELECTED_HOSPITAL_KEY);
    } catch {
      // ignore
    }
  }

  function logout() {
    clearToken();
    router.push("/login");
  }

  return (
    <AppShell
      title="Hospitals"
      subtitle="Search hospitals from the CMS NPI Registry and select the one that matches your records."
      activeNav="Records"
      onLogout={logout}
      right={
        selected ? (
          <span className="pill-success">
            Selected: {selected.name} (NPI {selected.npi})
          </span>
        ) : (
          <span className="pill">No hospital selected</span>
        )
      }
    >
      {/* Selected hospital card */}
      <div className="card">
        <div className="card-h">
          <div>
            <div className="text-sm font-semibold">Current selection</div>
            <div className="text-xs text-slate-500">
              This selection is saved on this device for now (localStorage). Next step: we’ll persist it to your profile.
            </div>
          </div>
          {selected ? (
            <button className="btn-ghost" onClick={clearSelection}>
              Clear
            </button>
          ) : null}
        </div>

        <div className="card-b">
          {selected ? (
            <div className="grid gap-2">
              <div className="text-base font-semibold">{selected.name}</div>
              <div className="text-sm text-slate-700">{formatAddress(selected.address)}</div>
              <div className="flex flex-wrap gap-2 text-xs text-slate-600">
                <span className="pill">NPI: {selected.npi}</span>
                <span className="pill">Type: {primaryTaxonomy(selected)}</span>
                {selected.address?.telephone_number ? (
                  <span className="pill">Phone: {selected.address.telephone_number}</span>
                ) : null}
                {selected.status ? <span className="pill">Status: {selected.status}</span> : null}
              </div>
            </div>
          ) : (
            <div className="empty">
              Search below and click <span className="font-medium">Select</span> to set your hospital.
            </div>
          )}
        </div>
      </div>

      {/* Search */}
      <div className="card">
        <div className="card-h">
          <div>
            <div className="text-sm font-semibold">Find a hospital</div>
            <div className="text-xs text-slate-500">
              Enter a hospital name (e.g. “Unity Hospital”). If unsure, add city/state to narrow results.
            </div>
          </div>
          <button className="btn-ghost" onClick={() => runSearch(false)} disabled={loading || name.trim().length < 2}>
            {loading ? "Searching..." : "Search"}
          </button>
        </div>

        <div className="card-b grid gap-3">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <div className="label">Hospital name (required)</div>
              <input
                className="input mt-2"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Unity Hospital"
              />
              <div className="text-xs text-slate-500 mt-1">Tip: start with 2–3 words, then narrow with city/state.</div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div>
                <div className="label">City</div>
                <input
                  className="input mt-2"
                  value={city}
                  onChange={(e) => setCity(e.target.value)}
                  placeholder="Chicago"
                />
              </div>

              <div>
                <div className="label">State</div>
                <input
                  className="input mt-2"
                  value={stateUS}
                  onChange={(e) => setStateUS(e.target.value)}
                  placeholder="IL"
                />
              </div>

              <div>
                <div className="label">ZIP</div>
                <input
                  className="input mt-2"
                  value={postal}
                  onChange={(e) => setPostal(e.target.value)}
                  placeholder="60611"
                />
              </div>
            </div>
          </div>

          {err ? <div className="callout-warning">{err}</div> : null}
        </div>
      </div>

      {/* Results */}
      <div className="card">
        <div className="card-h">
          <div>
            <div className="text-sm font-semibold">Results</div>
            <div className="text-xs text-slate-500">
              {loading
                ? "Searching…"
                : data
                ? `${data.results.length} shown (CMS result_count: ${data.result_count ?? data.results.length})`
                : "Run a search to see results."}
            </div>
          </div>
          {data?.results?.length ? <span className="pill">{data.source}</span> : null}
        </div>

        <div className="card-b">
          {!data ? (
            <div className="empty">Start by searching a hospital name above.</div>
          ) : data.results.length === 0 ? (
            <div className="empty">No results returned. Try a broader name or remove filters.</div>
          ) : (
            <div className="overflow-auto">
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
                  {data.results.map((h) => {
                    const isSelected = selected?.npi === h.npi;
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
                            className={isSelected ? "btn-secondary" : "btn-primary"}
                            onClick={() => chooseHospital(h)}
                          >
                            {isSelected ? "Selected" : "Select"}
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>

              <div className="mt-3 text-xs text-slate-500">
                Results are from the CMS NPI Registry (organizations / NPI-2). Some entries may be clinics or groups; confirm using address/phone.
              </div>
            </div>
          )}
        </div>
      </div>
    </AppShell>
  );
}

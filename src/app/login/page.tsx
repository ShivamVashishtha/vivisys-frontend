"use client";

import { useMemo, useState } from "react";
import { api, setToken, Role } from "@/lib/api";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<"login" | "register">("register");
  const [role, setRole] = useState<Role>("guardian");
  const [email, setEmail] = useState("guardian@test.com");
  const [password, setPassword] = useState("pass12");
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const title = useMemo(() => {
    return mode === "register" ? "Create your account" : "Welcome back";
  }, [mode]);

  async function submit() {
    setErr(null);
    setLoading(true);
    try {
      const fn = mode === "register" ? api.register : api.login;
      const res = await fn(email, password, role);   // ✅ use fn
      setToken(res.access_token);

      if (role === "guardian") router.push("/guardian");
      else if (role === "doctor") router.push("/doctor");
      else if (role === "patient") router.push("/patient");
      else router.push("/");
    } catch (e: any) {
      setErr(e.message ?? "Failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen grid place-items-center p-6">
      <div className="w-full max-w-5xl grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Left: branding */}
        <div className="card overflow-hidden">
          <div className="card-b">
            <div className="flex items-center gap-2">
              <div className="h-10 w-10 rounded-xl bg-slate-900 text-white grid place-items-center font-bold">
                Mx
              </div>
              <div>
                <div className="text-lg font-semibold">Medaryx Portal</div>
                <div className="text-sm text-slate-600">Health records access (Demo)</div>
              </div>
            </div>

            <div className="mt-6 space-y-3 text-sm text-slate-700">
              <div className="card p-4 bg-slate-50 border-slate-100">
                <div className="font-semibold">How this demo works</div>
                <ul className="mt-2 space-y-1 list-disc pl-5 text-slate-600">
                  <li>Guardians create patients and register FHIR pointers.</li>
                  <li>Guardians grant consent to doctors (scope + expiry).</li>
                  <li>Doctors can fetch records only with valid consent.</li>
                  <li>Patients (18+) can access their own records directly.</li>
                </ul>
              </div>

              <div className="text-xs text-slate-500">
                Tip: create accounts for{" "}
                <span className="font-medium">guardian@test.com</span>,{" "}
                <span className="font-medium">doctor@test.com</span>,{" "}
                <span className="font-medium">patient@test.com</span> (same password).
              </div>
            </div>
          </div>
        </div>

        {/* Right: form */}
        <div className="card">
          <div className="card-b">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h1 className="text-2xl font-semibold">{title}</h1>
                <p className="text-sm text-slate-600 mt-1">
                  {mode === "register" ? "Register to begin." : "Sign in to continue."}
                </p>
              </div>
              <span className="pill">v0</span>
            </div>

            <div className="mt-5 grid grid-cols-2 gap-2">
              <button
                className={mode === "register" ? "btn-primary" : "btn-ghost"}
                onClick={() => setMode("register")}
              >
                Register
              </button>
              <button
                className={mode === "login" ? "btn-primary" : "btn-ghost"}
                onClick={() => setMode("login")}
              >
                Login
              </button>
            </div>

            <div className="mt-5 grid gap-4">
              <div>
                <div className="label">Role</div>
                <div className="mt-2 grid grid-cols-3 gap-2">
                  <button
                    className={role === "guardian" ? "btn-primary" : "btn-ghost"}
                    onClick={() => setRole("guardian")}
                    type="button"
                  >
                    Guardian
                  </button>
                  <button
                    className={role === "doctor" ? "btn-primary" : "btn-ghost"}
                    onClick={() => setRole("doctor")}
                    type="button"
                  >
                    Doctor
                  </button>
                  <button
                    className={role === "patient" ? "btn-primary" : "btn-ghost"}
                    onClick={() => setRole("patient")}
                    type="button"
                  >
                    Patient
                  </button>
                </div>
              </div>

              <div>
                <div className="label">Email</div>
                <input
                  className="input mt-2"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  autoComplete="email"
                />
              </div>

              <div>
                <div className="label">Password</div>
                <input
                  className="input mt-2"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  autoComplete={mode === "login" ? "current-password" : "new-password"}
                />
              </div>

              {err ? (
                <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                  {err}
                </div>
              ) : null}

              <button className="btn-primary w-full" disabled={loading} onClick={submit}>
                {loading ? "Working..." : mode === "register" ? "Create account" : "Sign in"}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

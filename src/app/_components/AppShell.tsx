"use client";

import React, { useMemo, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

type NavItem = {
  label: string;
  href: string;
  icon?: React.ReactNode;
};

type AppShellProps = {
  title: string;
  subtitle?: string;
  activeNav?: string;
  right?: React.ReactNode;
  onLogout?: () => void;
  children: React.ReactNode;
};

function IconGrid(props: { className?: string }) {
  return (
    <svg
      className={props.className}
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M4 4h7v7H4V4Zm9 0h7v7h-7V4ZM4 13h7v7H4v-7Zm9 0h7v7h-7v-7Z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function IconFile(props: { className?: string }) {
  return (
    <svg
      className={props.className}
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M14 2H7a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7l-5-5Z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
      <path
        d="M14 2v5h5"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
      <path
        d="M8 13h8M8 17h8M8 9h3"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}

function IconShield(props: { className?: string }) {
  return (
    <svg
      className={props.className}
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M12 2 20 6v7c0 5-3.4 9.4-8 11-4.6-1.6-8-6-8-11V6l8-4Z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
      <path
        d="M9.5 12.2 11 13.7l3.7-4.2"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function IconUsers(props: { className?: string }) {
  return (
    <svg
      className={props.className}
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
      <path
        d="M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
      <path
        d="M22 21v-2a4 4 0 0 0-3-3.87"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
      <path
        d="M16 3.13a4 4 0 0 1 0 7.75"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function IconMenu(props: { className?: string }) {
  return (
    <svg
      className={props.className}
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M4 6h16M4 12h16M4 18h16"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}

function IconLogout(props: { className?: string }) {
  return (
    <svg
      className={props.className}
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
      <path
        d="M16 17l5-5-5-5"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
      <path
        d="M21 12H9"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}

function cx(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

export default function AppShell(props: AppShellProps) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);

  const role = useMemo<"patient" | "doctor" | "guardian" | "unknown">(() => {
    if (!pathname) return "unknown";
    if (pathname.startsWith("/patient")) return "patient";
    if (pathname.startsWith("/doctor")) return "doctor";
    if (pathname.startsWith("/guardian")) return "guardian";
    return "unknown";
  }, [pathname]);

  const nav: NavItem[] = useMemo(() => {
    if (role === "patient") {
      return [
        { label: "Records", href: "/patient#records", icon: <IconFile /> },
        { label: "Add Record", href: "/patient#add", icon: <IconGrid /> },
        { label: "Consents", href: "/patient#consents", icon: <IconShield /> },
      ];
    }
    if (role === "doctor") {
      return [
        { label: "Patient Lookup", href: "/doctor#lookup", icon: <IconUsers /> },
        { label: "Records", href: "/doctor#records", icon: <IconFile /> },
      ];
    }
    if (role === "guardian") {
      return [
        { label: "Patients", href: "/guardian#patients", icon: <IconUsers /> },
        { label: "Consents", href: "/guardian#consents", icon: <IconShield /> },
        { label: "Records", href: "/guardian#records", icon: <IconFile /> },
      ];
    }
    return [{ label: "Login", href: "/login", icon: <IconShield /> }];
  }, [role]);

  const brand = (
    <div className="flex items-center gap-2">
      <div className="h-10 w-10 rounded-2xl bg-slate-900 text-white grid place-items-center font-bold">
        VS
      </div>
      <div className="leading-tight">
        <div className="text-sm font-semibold text-slate-900">ViviSys</div>
        <div className="text-xs text-slate-500">Health data portal</div>
      </div>
    </div>
  );

  const Sidebar = (
    <aside className="h-full w-[280px] bg-white border-r border-slate-200 flex flex-col">
      <div className="p-4">{brand}</div>

      <div className="px-4 pb-3">
        <div className="flex items-center gap-2 text-xs">
          <span className="pill">Role: {role}</span>
          <span className="pill">Demo</span>
        </div>
        <div className="mt-2 text-[11px] text-slate-500">
          Access is consent-based and audited. Patients can revoke at any time.
        </div>
      </div>

      <nav className="px-2 mt-2 flex-1">
        <div className="px-3 text-[11px] uppercase tracking-wide text-slate-500 mb-2">
          Navigation
        </div>

        <div className="grid gap-1">
          {nav.map((item) => {
            const isActive = props.activeNav
              ? props.activeNav === item.label
              : false;

            return (
              <Link
                key={item.label}
                href={item.href}
                className={cx(
                  "flex items-center gap-3 rounded-xl px-3 py-2 text-sm transition",
                  "hover:bg-slate-50 hover:text-slate-900",
                  isActive
                    ? "bg-slate-100 text-slate-900 font-medium"
                    : "text-slate-700"
                )}
                onClick={() => setMobileOpen(false)}
              >
                <span className="text-slate-600">{item.icon}</span>
                <span>{item.label}</span>
              </Link>
            );
          })}
        </div>

        <div className="mt-6 px-3">
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
            <div className="text-xs font-semibold text-slate-800">
              Security & Trust
            </div>
            <ul className="mt-2 text-[11px] text-slate-600 space-y-1">
              <li>• Encrypted in transit</li>
              <li>• Scoped consents (incl. “all”)</li>
              <li>• Access is logged</li>
            </ul>
          </div>
        </div>
      </nav>

      <div className="p-3 border-t border-slate-200">
        <Link href="/login" className="btn-ghost w-full">
          Switch account
        </Link>
      </div>
    </aside>
  );

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Mobile drawer overlay */}
      {mobileOpen ? (
        <div
          className="fixed inset-0 z-40 bg-black/30 md:hidden"
          onClick={() => setMobileOpen(false)}
        />
      ) : null}

      {/* Mobile drawer */}
      <div
        className={cx(
          "fixed inset-y-0 left-0 z-50 md:hidden transition-transform",
          mobileOpen ? "translate-x-0" : "-translate-x-full"
        )}
      >
        {Sidebar}
      </div>

      {/* Desktop layout */}
      <div className="hidden md:flex">
        {Sidebar}
        <div className="flex-1 min-w-0">
          {/* Topbar */}
          <header className="sticky top-0 z-30 bg-white/80 backdrop-blur border-b border-slate-200">
            <div className="px-6 py-4 flex items-start justify-between gap-3">
              <div>
                <div className="text-xl font-semibold text-slate-900">
                  {props.title}
                </div>
                {props.subtitle ? (
                  <div className="text-sm text-slate-600 mt-1 max-w-3xl">
                    {props.subtitle}
                  </div>
                ) : null}
              </div>

              <div className="flex items-center gap-2">
                {props.right ? (
                  <div className="hidden lg:flex items-center gap-2">
                    {props.right}
                  </div>
                ) : null}

                {props.onLogout ? (
                  <button className="btn-ghost" onClick={props.onLogout}>
                    <span className="inline-flex items-center gap-2">
                      <IconLogout />
                      Logout
                    </span>
                  </button>
                ) : null}
              </div>
            </div>
          </header>

          {/* Content */}
          <main className="px-6 py-6">
            <div className="grid gap-4">{props.children}</div>
          </main>
        </div>
      </div>

      {/* Mobile topbar + content */}
      <div className="md:hidden">
        <header className="sticky top-0 z-30 bg-white/90 backdrop-blur border-b border-slate-200">
          <div className="px-4 py-3 flex items-center justify-between gap-3">
            <button
              className="btn-ghost"
              onClick={() => setMobileOpen(true)}
              aria-label="Open menu"
            >
              <IconMenu />
            </button>

            <div className="min-w-0 flex-1">
              <div className="text-base font-semibold text-slate-900 truncate">
                {props.title}
              </div>
              {props.subtitle ? (
                <div className="text-xs text-slate-600 truncate">
                  {props.subtitle}
                </div>
              ) : null}
            </div>

            {props.onLogout ? (
              <button className="btn-ghost" onClick={props.onLogout} aria-label="Logout">
                <IconLogout />
              </button>
            ) : (
              <Link href="/login" className="btn-ghost">
                Login
              </Link>
            )}
          </div>

          {props.right ? (
            <div className="px-4 pb-3 flex flex-wrap gap-2">{props.right}</div>
          ) : null}
        </header>

        <main className="px-4 py-5">
          <div className="grid gap-4">{props.children}</div>
        </main>
      </div>
    </div>
  );
}

"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import type { ReactNode } from "react";

type NavItem = {
  label: string;
  href: string;
  anchor?: boolean;
};

export default function AppShell({
  title,
  subtitle,
  activeNav,
  onLogout,
  right,
  children,
}: {
  title: string;
  subtitle?: string;
  activeNav: string;
  onLogout: () => void;
  right?: ReactNode;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();

  // Decide which "home" to show based on current URL.
  // - Guardian UI at /guardian
  // - Doctor UI at /doctor
  // - Patient UI at /patient
  const base =
    pathname?.startsWith("/doctor") ? "/doctor" : pathname?.startsWith("/patient") ? "/patient" : "/guardian";

  const nav: NavItem[] = [
    { label: "Dashboard", href: base },
    // These are optional sections—keep them as anchors so you can expand later without making new routes.
    { label: "Patients", href: "#patients", anchor: true },
    { label: "Consents", href: "#consents", anchor: true },
    { label: "Records", href: "#records", anchor: true },
    { label: "Audit", href: "#audit", anchor: true },
  ];

  function onAnchorClick(e: React.MouseEvent<HTMLAnchorElement>, href: string) {
    // Smooth-scroll to section ids on the same page.
    if (!href.startsWith("#")) return;

    e.preventDefault();
    const el = document.querySelector(href);
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
    else {
      // If not found, still update URL hash so user can see intent
      router.replace(`${pathname}${href}`);
    }
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="mx-auto max-w-[1200px] px-4 py-6">
        <div className="grid grid-cols-1 lg:grid-cols-[260px_1fr] gap-6">
          {/* Sidebar */}
          <aside className="card h-fit sticky top-6">
            <div className="card-b">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-xl bg-slate-900 text-white grid place-items-center font-semibold">
                  Mx
                </div>
                <div>
                  <div className="font-semibold leading-tight">Medaryx</div>
                  <div className="text-xs text-slate-500">Records Portal</div>
                </div>
              </div>

              <div className="mt-5 grid gap-1">
                {nav.map((item) => {
                  const isActive = item.label === activeNav;
                  const cls = [
                    "w-full text-left px-3 py-2 rounded-xl text-sm transition",
                    isActive ? "bg-slate-900 text-white" : "text-slate-700 hover:bg-slate-100",
                  ].join(" ");

                  // Anchor (same-page section)
                  if (item.anchor) {
                    return (
                      <a
                        key={item.label}
                        href={item.href}
                        className={cls}
                        onClick={(e) => onAnchorClick(e, item.href)}
                      >
                        {item.label}
                      </a>
                    );
                  }

                  // Route link
                  return (
                    <Link key={item.label} href={item.href} className={cls}>
                      {item.label}
                    </Link>
                  );
                })}
              </div>

              <div className="mt-5 pt-5 border-t border-slate-200 flex items-center justify-between">
                <span className="pill">Demo</span>
                <button className="link" onClick={onLogout}>
                  Logout
                </button>
              </div>
            </div>
          </aside>

          {/* Main */}
          <main className="grid gap-4">
            <div className="card">
              <div className="card-b flex items-start justify-between gap-4">
                <div>
                  <div className="text-xl font-semibold">{title}</div>
                  {subtitle ? <div className="text-sm text-slate-600 mt-1">{subtitle}</div> : null}
                </div>
                {right ? <div className="flex flex-wrap gap-2 justify-end">{right}</div> : null}
              </div>
            </div>

            {children}
          </main>
        </div>
      </div>
    </div>
  );
}

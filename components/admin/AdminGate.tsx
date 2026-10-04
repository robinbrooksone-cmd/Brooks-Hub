"use client";

import { useState } from "react";
import { AdminLogin } from "./AdminLogin";
import { AdminDashboard } from "./AdminDashboard";
import { SitePhoto } from "@/components/PhotoProvider";

// Always starts logged out, even if a valid session cookie exists from
// before — every fresh page load (or reload) shows the PIN screen again.
// The cookie still guards the actual data-changing server actions
// (requireAdmin()), so this is a UI convenience gate on top of real
// server-side protection, not instead of it.
export function AdminGate() {
  const [loggedIn, setLoggedIn] = useState(false);

  if (!loggedIn) {
    return (
      <section
        className="relative overflow-hidden"
        style={{ minHeight: "100vh", padding: "clamp(90px,10vw,120px) clamp(14px,4vw,32px) 60px", background: "#221a15" }}
      >
        <SitePhoto slot="/images/admin-login-bg.jpg" priority className="object-cover" placeholder="" />
        <div className="absolute inset-0 pointer-events-none" style={{ background: "linear-gradient(180deg, rgba(24,16,10,0.72), rgba(24,16,10,0.85))" }} />
        <div className="relative z-[2]">
          <AdminLogin onSuccess={() => setLoggedIn(true)} />
        </div>
      </section>
    );
  }

  return (
    <section style={{ minHeight: "100vh", background: "#221a15", padding: "clamp(90px,10vw,120px) clamp(14px,4vw,32px) 60px" }}>
      <AdminDashboard onLogout={() => setLoggedIn(false)} />
    </section>
  );
}

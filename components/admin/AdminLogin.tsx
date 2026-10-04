"use client";

import { useState } from "react";
import { adminLoginAction } from "@/app/actions";

export function AdminLogin({ onSuccess }: { onSuccess: () => void }) {
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit() {
    setLoading(true);
    setError("");
    const ok = await adminLoginAction(pin);
    setLoading(false);
    if (ok) {
      onSuccess();
    } else {
      setError("Incorrect PIN. Try again.");
    }
  }

  return (
    <div className="mx-auto text-center" style={{ maxWidth: 400 }}>
      <div className="font-display italic" style={{ fontSize: 42, color: "var(--c-ivory)" }}>
        Bride Dashboard
      </div>
      <p style={{ color: "var(--c-muted)", fontSize: 14, margin: "10px 0 30px" }}>
        Enter your PIN to manage RSVPs, seating, and the day.
      </p>
      <input
        type="password"
        value={pin}
        onChange={(e) => setPin(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && submit()}
        placeholder="PIN"
        autoFocus
        style={{
          width: "100%",
          padding: "16px 18px",
          background: "rgba(0,0,0,0.25)",
          border: "1px solid rgba(203,177,144,0.3)",
          borderRadius: 8,
          color: "var(--c-ivory)",
          fontSize: 20,
          textAlign: "center",
          letterSpacing: "0.3em",
          outline: "none",
        }}
      />
      {error && <div style={{ color: "#e0907a", fontSize: 13, marginTop: 12 }}>{error}</div>}
      <button
        onClick={submit}
        disabled={loading || !pin}
        className="w-full cursor-pointer uppercase text-white"
        style={{ marginTop: 18, padding: 15, background: "var(--c-gold)", border: "none", borderRadius: 8, fontSize: 12, letterSpacing: "0.2em", opacity: loading || !pin ? 0.6 : 1 }}
      >
        {loading ? "…" : "Enter"}
      </button>
      <p style={{ color: "rgba(248,243,236,0.35)", fontSize: 12, marginTop: 20 }}>
        Default PIN is set via <code>ADMIN_PIN</code> in your environment — see README.
      </p>
    </div>
  );
}

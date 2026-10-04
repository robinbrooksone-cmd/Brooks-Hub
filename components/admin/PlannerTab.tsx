"use client";

import { useEffect, useState } from "react";
import {
  addPaymentAction,
  addTaskAction,
  getPlannerAction,
  removePaymentAction,
  removeTaskAction,
  togglePaymentAction,
  toggleTaskAction,
} from "@/app/actions";
import type { Payment, Task } from "@/lib/types";
import { btnGold, inputStyle, panelStyle } from "./AdminDashboard";

export function PlannerTab() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [taskTitle, setTaskTitle] = useState("");
  const [taskDate, setTaskDate] = useState("");
  const [payVendor, setPayVendor] = useState("");
  const [payAmount, setPayAmount] = useState("");
  const [payDate, setPayDate] = useState("");

  const refresh = () => getPlannerAction().then((p) => (setTasks(p.tasks), setPayments(p.payments)));

  useEffect(() => {
    refresh();
  }, []);

  return (
    <div className="grid gap-6" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(320px,1fr))" }}>
      <div style={panelStyle}>
        <h3 className="font-display" style={{ fontSize: 22, color: "var(--c-ivory)", margin: "0 0 14px" }}>
          To-Do
        </h3>
        <div className="flex gap-2 flex-wrap" style={{ marginBottom: 16 }}>
          <input value={taskTitle} onChange={(e) => setTaskTitle(e.target.value)} placeholder="Task title" style={{ ...inputStyle, flex: 1, minWidth: 140 }} />
          <input type="date" value={taskDate} onChange={(e) => setTaskDate(e.target.value)} style={inputStyle} />
          <button
            style={btnGold}
            onClick={async () => {
              if (!taskTitle) return;
              await addTaskAction(taskTitle, taskDate);
              setTaskTitle("");
              setTaskDate("");
              refresh();
            }}
          >
            Add
          </button>
        </div>
        <div className="flex flex-col gap-2">
          {tasks.map((t) => (
            <div key={t.id} className="flex items-center gap-3" style={{ padding: "10px 0", borderBottom: "1px solid var(--c-line)" }}>
              <button
                onClick={async () => {
                  await toggleTaskAction(t.id);
                  refresh();
                }}
                className="cursor-pointer flex items-center justify-center text-white"
                style={{ width: 20, height: 20, borderRadius: 5, background: t.done ? "var(--c-gold)" : "transparent", border: "1px solid rgba(203,177,144,0.4)", flexShrink: 0, fontSize: 11 }}
              >
                {t.done ? "✓" : ""}
              </button>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 14, color: t.done ? "var(--c-muted)" : "var(--c-ivory)", textDecoration: t.done ? "line-through" : "none" }}>{t.title}</div>
                {t.date && <div style={{ fontSize: 11, color: "var(--c-muted)" }}>{t.date}</div>}
              </div>
              <button
                onClick={async () => {
                  await removeTaskAction(t.id);
                  refresh();
                }}
                className="cursor-pointer"
                style={{ background: "transparent", border: "none", color: "rgba(248,243,236,0.4)", fontSize: 16 }}
              >
                ✕
              </button>
            </div>
          ))}
          {tasks.length === 0 && <div style={{ color: "var(--c-muted)", fontSize: 13 }}>No tasks yet.</div>}
        </div>
      </div>

      <div style={panelStyle}>
        <h3 className="font-display" style={{ fontSize: 22, color: "var(--c-ivory)", margin: "0 0 14px" }}>
          Vendor Payments
        </h3>
        <div className="flex gap-2 flex-wrap" style={{ marginBottom: 16 }}>
          <input value={payVendor} onChange={(e) => setPayVendor(e.target.value)} placeholder="Vendor" style={{ ...inputStyle, flex: 1, minWidth: 100 }} />
          <input value={payAmount} onChange={(e) => setPayAmount(e.target.value)} placeholder="Amount" style={{ ...inputStyle, width: 90 }} />
          <input type="date" value={payDate} onChange={(e) => setPayDate(e.target.value)} style={inputStyle} />
          <button
            style={btnGold}
            onClick={async () => {
              if (!payVendor) return;
              await addPaymentAction(payVendor, payAmount, payDate);
              setPayVendor("");
              setPayAmount("");
              setPayDate("");
              refresh();
            }}
          >
            Add
          </button>
        </div>
        <div className="flex flex-col gap-2">
          {payments.map((p) => (
            <div key={p.id} className="flex items-center gap-3" style={{ padding: "10px 0", borderBottom: "1px solid var(--c-line)" }}>
              <button
                onClick={async () => {
                  await togglePaymentAction(p.id);
                  refresh();
                }}
                className="cursor-pointer flex items-center justify-center text-white"
                style={{ width: 20, height: 20, borderRadius: 5, background: p.paid ? "var(--c-gold)" : "transparent", border: "1px solid rgba(203,177,144,0.4)", flexShrink: 0, fontSize: 11 }}
              >
                {p.paid ? "✓" : ""}
              </button>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 14, color: p.paid ? "var(--c-muted)" : "var(--c-ivory)", textDecoration: p.paid ? "line-through" : "none" }}>
                  {p.vendor} {p.amount && `· R${p.amount}`}
                </div>
                {p.date && <div style={{ fontSize: 11, color: "var(--c-muted)" }}>{p.date}</div>}
              </div>
              <button
                onClick={async () => {
                  await removePaymentAction(p.id);
                  refresh();
                }}
                className="cursor-pointer"
                style={{ background: "transparent", border: "none", color: "rgba(248,243,236,0.4)", fontSize: 16 }}
              >
                ✕
              </button>
            </div>
          ))}
          {payments.length === 0 && <div style={{ color: "var(--c-muted)", fontSize: 13 }}>No payments yet.</div>}
        </div>
      </div>
    </div>
  );
}

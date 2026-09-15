"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { passwordResetConfirmSchema, passwordResetRequestSchema } from "@app/types";
import { ApiError, apiFetch } from "@/lib/api";
import { AuthCard } from "@/components/auth-card";

export default function ResetPasswordPage() {
  const router = useRouter();
  const [step, setStep] = useState<"request" | "confirm">("request");
  const [email, setEmail] = useState("");
  const [token, setToken] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleRequest(event: FormEvent) {
    event.preventDefault();
    setError(null);

    const parsed = passwordResetRequestSchema.safeParse({ email });
    if (!parsed.success) {
      setError("Please enter a valid email address");
      return;
    }

    setSubmitting(true);
    try {
      await apiFetch("/api/auth/password-reset/request", { method: "POST", body: parsed.data });
      setInfo("If that email is registered, a reset code has been sent to it.");
      setStep("confirm");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleConfirm(event: FormEvent) {
    event.preventDefault();
    setError(null);

    const parsed = passwordResetConfirmSchema.safeParse({ token, newPassword });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Please check your details");
      return;
    }

    setSubmitting(true);
    try {
      await apiFetch("/api/auth/password-reset/confirm", { method: "POST", body: parsed.data });
      router.push("/login");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Invalid or expired code");
    } finally {
      setSubmitting(false);
    }
  }

  if (step === "request") {
    return (
      <AuthCard title="Reset your password" subtitle="We'll send a one-time code to your email.">
        <form onSubmit={handleRequest} className="space-y-4">
          {error && <p className="alert-error">{error}</p>}
          <div>
            <label className="field-label" htmlFor="email">Email</label>
            <input
              id="email"
              type="email"
              className="field-input"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              required
            />
          </div>
          <button type="submit" disabled={submitting} className="btn-primary w-full">
            {submitting ? "Sending…" : "Send reset code"}
          </button>
          <p className="text-center text-sm">
            <Link href="/login" className="text-brand-600 hover:underline">
              Back to sign in
            </Link>
          </p>
        </form>
      </AuthCard>
    );
  }

  return (
    <AuthCard title="Enter your reset code" subtitle="Check your email — the code expires in 15 minutes.">
      <form onSubmit={handleConfirm} className="space-y-4">
        {info && <p className="alert-success">{info}</p>}
        {error && <p className="alert-error">{error}</p>}
        <div>
          <label className="field-label" htmlFor="token">Reset code</label>
          <input
            id="token"
            className="field-input"
            value={token}
            onChange={(e) => setToken(e.target.value)}
            required
          />
        </div>
        <div>
          <label className="field-label" htmlFor="newPassword">New password</label>
          <input
            id="newPassword"
            type="password"
            className="field-input"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            autoComplete="new-password"
            required
          />
        </div>
        <button type="submit" disabled={submitting} className="btn-primary w-full">
          {submitting ? "Resetting…" : "Reset password"}
        </button>
      </form>
    </AuthCard>
  );
}

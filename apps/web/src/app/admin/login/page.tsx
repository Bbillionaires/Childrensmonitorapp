"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { adminLoginRequestSchema } from "@app/types";
import { ApiError, apiFetch } from "@/lib/api";
import { useAdminAuth } from "@/lib/admin-auth-context";
import { AuthCard } from "@/components/auth-card";
import { PasswordField } from "@/components/password-field";

export default function AdminLoginPage() {
  const router = useRouter();
  const { refresh } = useAdminAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);

    const parsed = adminLoginRequestSchema.safeParse({ email, password });
    if (!parsed.success) {
      setError("Please check your details");
      return;
    }

    setSubmitting(true);
    try {
      await apiFetch("/api/admin/login", { method: "POST", body: parsed.data });
      await refresh();
      router.push("/admin");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AuthCard title="Admin sign in" subtitle="Internal console — operator access only">
      <form onSubmit={handleSubmit} className="space-y-4">
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
        <PasswordField
          id="password"
          label="Password"
          value={password}
          onChange={setPassword}
          autoComplete="current-password"
          required
        />
        <button type="submit" disabled={submitting} className="btn-primary w-full">
          {submitting ? "Signing in…" : "Sign in"}
        </button>
      </form>
    </AuthCard>
  );
}

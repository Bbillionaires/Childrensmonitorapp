"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { schoolLoginRequestSchema } from "@app/types";
import { ApiError, apiFetch } from "@/lib/api";
import { AuthCard } from "@/components/auth-card";
import { PasswordField } from "@/components/password-field";

export default function SchoolLoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);

    const parsed = schoolLoginRequestSchema.safeParse({ email, password });
    if (!parsed.success) {
      setError("Please check your details");
      return;
    }

    setSubmitting(true);
    try {
      await apiFetch("/api/schools/login", { method: "POST", body: parsed.data });
      router.push("/school");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AuthCard title="School sign in" subtitle="Manage your sponsored seats">
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
        <p className="text-center text-sm">
          <Link href="/reset-password?role=school" className="text-brand-600 hover:underline">
            Forgot password?
          </Link>
        </p>
        <p className="text-center text-sm text-slate-500">
          New school?{" "}
          <Link href="/school/register" className="font-medium text-brand-600 hover:underline">
            Register
          </Link>
        </p>
      </form>
    </AuthCard>
  );
}

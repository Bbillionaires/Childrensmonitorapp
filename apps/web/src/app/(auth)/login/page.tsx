"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { loginRequestSchema } from "@app/types";
import { ApiError, apiFetch } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { AuthCard } from "@/components/auth-card";
import { PasswordField } from "@/components/password-field";

export default function LoginPage() {
  const router = useRouter();
  const { refresh } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);

    const parsed = loginRequestSchema.safeParse({ email, password });
    if (!parsed.success) {
      setError("Please enter a valid email and password");
      return;
    }

    setSubmitting(true);
    try {
      await apiFetch("/api/auth/login", { method: "POST", body: parsed.data });
      await refresh();
      router.push("/children");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AuthCard title="Sign in">
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
        <div className="flex items-center justify-between text-sm">
          <Link href="/reset-password" className="text-brand-600 hover:underline">
            Forgot password?
          </Link>
          <Link href="/register" className="text-brand-600 hover:underline">
            Create an account
          </Link>
        </div>
      </form>
    </AuthCard>
  );
}

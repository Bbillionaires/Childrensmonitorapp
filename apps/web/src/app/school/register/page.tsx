"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { schoolRegisterRequestSchema } from "@app/types";
import { ApiError, apiFetch } from "@/lib/api";
import { AuthCard } from "@/components/auth-card";

/**
 * Milestone 11 — see SCHOOL_SEATS.md. A school's own account, a fully separate identity space
 * from a parent's (SchoolAdminAccount, not ParentAccount) — see school-auth-service.ts.
 */
export default function SchoolRegisterPage() {
  const router = useRouter();
  const [schoolName, setSchoolName] = useState("");
  const [adminName, setAdminName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);

    const parsed = schoolRegisterRequestSchema.safeParse({ schoolName, adminName, email, password });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Please check your details");
      return;
    }

    setSubmitting(true);
    try {
      await apiFetch("/api/schools/register", { method: "POST", body: parsed.data });
      router.push("/school");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AuthCard title="Register your school" subtitle="Sponsor Family Safety subscriptions for your families">
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && <p className="alert-error">{error}</p>}
        <div>
          <label className="field-label" htmlFor="schoolName">School name</label>
          <input
            id="schoolName"
            className="field-input"
            value={schoolName}
            onChange={(e) => setSchoolName(e.target.value)}
            required
          />
        </div>
        <div>
          <label className="field-label" htmlFor="adminName">Your name</label>
          <input
            id="adminName"
            className="field-input"
            value={adminName}
            onChange={(e) => setAdminName(e.target.value)}
            autoComplete="name"
            required
          />
        </div>
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
        <div>
          <label className="field-label" htmlFor="password">Password</label>
          <input
            id="password"
            type="password"
            className="field-input"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="new-password"
            required
          />
          <p className="mt-1 text-xs text-slate-500">
            At least 10 characters, with an uppercase letter, lowercase letter, and a number.
          </p>
        </div>
        <button type="submit" disabled={submitting} className="btn-primary w-full">
          {submitting ? "Creating account…" : "Create school account"}
        </button>
        <p className="text-center text-sm text-slate-500">
          Already registered?{" "}
          <Link href="/school/login" className="font-medium text-brand-600 hover:underline">
            Sign in
          </Link>
        </p>
      </form>
    </AuthCard>
  );
}

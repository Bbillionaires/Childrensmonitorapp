import Link from "next/link";

export default function LandingPage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col items-center justify-center gap-8 px-4 text-center">
      <div>
        <p className="mb-2 text-sm font-semibold uppercase tracking-wide text-brand-600">
          Family Safety
        </p>
        <h1 className="text-3xl font-bold text-slate-900 sm:text-4xl">
          If you didn&apos;t approve it, your child doesn&apos;t see it.
        </h1>
        <p className="mx-auto mt-4 max-w-xl text-slate-600">
          Your child&apos;s environment starts empty. Nothing becomes visible until you
          approve it — no open internet, no algorithmic recommendations, no surprises.
        </p>
      </div>
      <div className="flex gap-3">
        <Link href="/register" className="btn-primary">
          Create a parent account
        </Link>
        <Link href="/login" className="btn-secondary">
          Sign in
        </Link>
      </div>
    </main>
  );
}

export function ComingSoon({ title, milestone, description }: { title: string; milestone: string; description: string }) {
  return (
    <div className="card">
      <h2 className="text-lg font-semibold text-slate-900">{title}</h2>
      <p className="mt-2 text-sm text-slate-600">{description}</p>
      <p className="mt-4 inline-block rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-500">
        Coming in {milestone} — see IMPLEMENTATION_PLAN.md
      </p>
    </div>
  );
}

import Link from "next/link";
import { ComingSoon } from "@/components/coming-soon";

export default function WebsitesPage() {
  return (
    <div className="space-y-4">
      <div className="card">
        <h2 className="text-sm font-semibold text-slate-900">Basic website whitelisting is live</h2>
        <p className="mt-1 text-sm text-slate-600">
          Paste a website URL under{" "}
          <Link href="/pending-reviews" className="font-medium text-brand-600 hover:underline">
            Pending Reviews
          </Link>{" "}
          to whitelist its domain for a child, the same way you approve videos.
        </p>
      </div>
      <ComingSoon
        title="Path-level restrictions & redirect blocking"
        milestone="Milestone 3"
        description="Restricting a whitelist entry to a specific page/section of a domain, and blocking a controlled browser from following a redirect off an approved page."
      />
    </div>
  );
}

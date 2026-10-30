export interface NavItem {
  href: string;
  label: string;
  status: "ready" | "soon";
}

/** Mirrors the dashboard sections listed in PRODUCT_REQUIREMENTS.md. */
export const NAV_ITEMS: NavItem[] = [
  { href: "/children", label: "Children", status: "ready" },
  { href: "/approved-content", label: "Approved Content", status: "ready" },
  { href: "/pending-reviews", label: "Pending Reviews", status: "ready" },
  { href: "/playlists", label: "Playlists", status: "ready" },
  { href: "/discover", label: "Discover Content", status: "ready" },
  { href: "/websites", label: "Websites", status: "soon" },
  { href: "/activity", label: "Viewing Activity", status: "ready" },
  { href: "/scores", label: "Supervision Scores", status: "ready" },
  { href: "/alerts", label: "Safety Alerts", status: "ready" },
  { href: "/screen-time", label: "Screen-Time Settings", status: "soon" },
  { href: "/account", label: "Account Settings", status: "ready" },
];

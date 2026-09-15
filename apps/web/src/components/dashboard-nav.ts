export interface NavItem {
  href: string;
  label: string;
  status: "ready" | "soon";
}

/** Mirrors the dashboard sections listed in PRODUCT_REQUIREMENTS.md. */
export const NAV_ITEMS: NavItem[] = [
  { href: "/children", label: "Children", status: "ready" },
  { href: "/approved-content", label: "Approved Content", status: "soon" },
  { href: "/pending-reviews", label: "Pending Reviews", status: "soon" },
  { href: "/playlists", label: "Playlists", status: "soon" },
  { href: "/discover", label: "Discover Content", status: "soon" },
  { href: "/websites", label: "Websites", status: "soon" },
  { href: "/activity", label: "Viewing Activity", status: "soon" },
  { href: "/scores", label: "Supervision Scores", status: "soon" },
  { href: "/alerts", label: "Safety Alerts", status: "soon" },
  { href: "/screen-time", label: "Screen-Time Settings", status: "soon" },
  { href: "/account", label: "Account Settings", status: "ready" },
];

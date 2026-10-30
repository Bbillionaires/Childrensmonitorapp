import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { AuthProvider } from "@/lib/auth-context";
import "./globals.css";

export const metadata: Metadata = {
  title: "Family Safety Dashboard",
  description: "Parent-controlled content for kids — nothing reaches a child until a parent approves it.",
  // Installable on a phone/tablet home screen (Milestone 8) — deliberately no service worker,
  // since caching anything here would undermine "a parent's approval change takes effect
  // immediately, even mid-session" (see ARCHITECTURE.md and the Milestone 3 test covering it).
  manifest: "/manifest.webmanifest",
  appleWebApp: { title: "Family Safety", statusBarStyle: "default" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#3b5fe0",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}

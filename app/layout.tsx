import type { Metadata } from "next";
import { headers } from "next/headers";
import "./globals.css";

export async function generateMetadata(): Promise<Metadata> {
  const requestHeaders = await headers();
  const host = requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host") ?? "localhost:3000";
  const protocol = requestHeaders.get("x-forwarded-proto") ?? (host.includes("localhost") ? "http" : "https");
  const origin = `${protocol}://${host}`;
  const title = "People Pulse 3000 — ศูนย์บัญชาการบุคลากรแห่งอนาคต";
  const description = "ระบบ HR แห่งอนาคตที่รวมทูดูลิส KPI สกิล แฟ้มผลงาน แต้ม รางวัล และ Hero Office Campus 3D หลายห้องไว้ในศูนย์บัญชาการเดียว";

  return {
    metadataBase: new URL(origin),
    title,
    description,
    openGraph: {
      title,
      description,
      type: "website",
      locale: "th_TH",
      images: [{ url: new URL("/og-hero-campus.png", origin).toString(), width: 1536, height: 1024, alt: "People Pulse 3000 Hero Office Campus" }],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [new URL("/og-hero-campus.png", origin).toString()],
    },
  };
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="th">
      <body>{children}</body>
    </html>
  );
}

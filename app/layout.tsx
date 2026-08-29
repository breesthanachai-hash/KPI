import type { Metadata } from "next";
import { headers } from "next/headers";
import "@fontsource-variable/noto-sans-thai/wght.css";
import "./globals.css";

export async function generateMetadata(): Promise<Metadata> {
  const requestHeaders = await headers();
  const host = requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host") ?? "localhost:3000";
  const protocol = requestHeaders.get("x-forwarded-proto") ?? (host.includes("localhost") ? "http" : "https");
  const origin = `${protocol}://${host}`;
  const title = "People Pulse — ระบบจัดการคนและงานที่ใช้ง่าย";
  const description = "ระบบ HR ที่รวมงาน KPI สกิล แฟ้มผลงาน เวลาเข้างาน ระบบ Points และรางวัล รวมถึงสำนักงานจำลอง 3D ไว้ในที่เดียว";

  return {
    metadataBase: new URL(origin),
    title,
    description,
    openGraph: {
      title,
      description,
      type: "website",
      locale: "th_TH",
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
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

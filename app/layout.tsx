import type { Metadata } from "next";
import { headers } from "next/headers";
import "./globals.css";

export async function generateMetadata(): Promise<Metadata> {
  const requestHeaders = await headers();
  const host = requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host") ?? "localhost:3000";
  const protocol = requestHeaders.get("x-forwarded-proto") ?? (host.includes("localhost") ? "http" : "https");
  const origin = `${protocol}://${host}`;
  const title = "People Pulse — ค่าพลังพนักงานและระบบบริหารบุคลากร";
  const description = "บริหารรูปโปรไฟล์ ค่าพลัง สกิล KPI และแฟ้มผลงานพนักงาน ค้นหาไฟล์หรือลิงก์งาน ตรวจสอบผู้อนุมัติ และใช้หลักฐานประกอบการประเมินได้ในระบบเดียว";

  return {
    metadataBase: new URL(origin),
    title,
    description,
    openGraph: {
      title,
      description,
      type: "website",
      locale: "th_TH",
      images: [{ url: new URL("/og.png", origin).toString(), width: 1536, height: 1024, alt: "People Pulse Employee Work Portfolio" }],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [new URL("/og.png", origin).toString()],
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

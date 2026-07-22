import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Arka Outbound Agent",
  description: "AI-native outbound marketing — research, personalize, approve, send.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}

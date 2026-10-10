import type { Metadata, Viewport } from "next";
import PWAProvider from "@/components/pwa/PWAProvider";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, statusBarStyle: "default", title: "LMS Credit" },
  icons: { apple: "/icons/apple-touch-icon.png" },
  title: "LMS Credit Core",
  description: "Sistema de gestión de préstamos",
};

export const viewport: Viewport = { width: "device-width", initialScale: 1, viewportFit: "cover", themeColor: "#6B21E8" };

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es">
      <body className={`${inter.variable} antialiased`}>
        {children}
        <PWAProvider />
      </body>
    </html>
  );
}

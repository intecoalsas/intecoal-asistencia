import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import "./theme.css";
import HeaderSidebarWrapper from "./_components/HeaderSidebarWrapper";
import { AuthProvider } from "./_components/AuthProvider";
import RegistroServiceWorker from "./_components/RegistroServiceWorker";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "INTECOAL Asistencia | Control de Asistencia",
  description:
    "Sistema seguro y moderno de registro de asistencia diaria mediante códigos QR dinámicos para INTECOAL S.A.S.",
  applicationName: "INTECOAL Asistencia",
  // El manifest (/manifest.webmanifest), favicon.ico y apple-icon.png se
  // enlazan automáticamente por las convenciones de archivos de Next.js.
  appleWebApp: {
    capable: true,
    title: "INTECOAL",
    statusBarStyle: "black",
  },
};

export const viewport: Viewport = {
  themeColor: "#0D0D0D",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="es"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-[var(--color-bg-main)] text-[var(--color-text-primary)] font-sans selection:bg-[var(--color-primary)] selection:text-[var(--color-on-primary)]">
        <AuthProvider>
          <HeaderSidebarWrapper>{children}</HeaderSidebarWrapper>
          <RegistroServiceWorker />
        </AuthProvider>
      </body>
    </html>
  );
}

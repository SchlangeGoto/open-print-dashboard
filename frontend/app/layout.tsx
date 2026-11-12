import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { ThemeProvider } from "next-themes";
import Script from "next/script";

import { ACCENTS } from "@/lib/accent";
import { AppearanceProvider } from "@/lib/appearance";
import { AuthProvider } from "@/lib/auth";
import { ServiceWorkerRegistration } from "@/components/layout/ServiceWorkerRegistration";
import { Toaster } from "@/components/ui/toast";
import { TooltipProvider } from "@/components/ui/tooltip";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Open Print Dashboard",
  description: "Bambu Lab 3D Printer Dashboard",
  icons: {
    icon: { url: "/icons/icon.svg", type: "image/svg+xml" },
    apple: "/icons/icon-180.png",
  },
};

export const viewport: Viewport = {
  themeColor: "#0a0a0a",
  width: "device-width",
  initialScale: 1,
};

// Runs before hydration so a saved accent never flashes the default colour.
const accentBootstrap = `
(function () {
  try {
    var accents = ${JSON.stringify(
      ACCENTS.map(({ id, color, foreground }) => ({ id, color, foreground })),
    )};
    var stored = localStorage.getItem("accent-color");
    var accent =
      accents.filter(function (item) { return item.id === stored; })[0] ||
      accents[0];
    var root = document.documentElement;
    root.style.setProperty("--brand", accent.color);
    root.style.setProperty("--brand-foreground", accent.foreground);
  } catch (error) {}
})();
`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
        <Script
          id="accent-bootstrap"
          strategy="beforeInteractive"
          dangerouslySetInnerHTML={{ __html: accentBootstrap }}
        />
        <ThemeProvider
          attribute="class"
          defaultTheme="dark"
          enableSystem
          disableTransitionOnChange
        >
          <AppearanceProvider>
            <TooltipProvider delay={200}>
              <Toaster>
                <AuthProvider>{children}</AuthProvider>
              </Toaster>
            </TooltipProvider>
          </AppearanceProvider>
          <ServiceWorkerRegistration />
        </ThemeProvider>
      </body>
    </html>
  );
}

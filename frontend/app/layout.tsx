import type { Metadata, Viewport } from "next";
import { Inter, Lexend_Exa } from "next/font/google";
import "./globals.css";
import { Providers } from "./providers";

const inter = Inter({
  variable: "--font-sans",
  subsets: ["latin", "cyrillic"],
});

const lexendExa = Lexend_Exa({
  variable: "--font-kofka",
  subsets: ["latin"],
  weight: ["600", "700", "800"],
});

export const metadata: Metadata = {
  title: "Kofka",
  description: "Kofka Social Network",
  manifest: "/manifest.json",
  icons: {
    icon: "/kofka-app-icon.svg",
    apple: "/kofka-app-icon.svg",
    shortcut: "/kofka-app-icon.svg",
  },
  other: {
    "mobile-web-app-capable": "yes",
    "apple-mobile-web-app-capable": "yes",
    "apple-mobile-web-app-status-bar-style": "black-translucent",
    "apple-mobile-web-app-title": "Kofka",
  },
};

export const viewport: Viewport = {
  themeColor: "#7730C7",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="ru"
      className={`${inter.variable} ${lexendExa.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <body className="min-h-full flex flex-col">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}

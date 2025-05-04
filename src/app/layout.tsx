
import type { Metadata } from "next";
// Corrected import for Geist Sans and Mono fonts - use named exports
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster"; // Import Toaster

// Instantiate fonts correctly using the named exports and assign CSS variables
const geistSans = GeistSans({
  variable: "--font-geist-sans",
  subsets: ["latin"], // Optional: Specify subsets if needed
});

const geistMono = GeistMono({
  variable: "--font-geist-mono",
  subsets: ["latin"], // Optional: Specify subsets if needed
});

export const metadata: Metadata = {
  title: "GhostLine P2P Chat", // Updated title
  description: "Real-time P2P chat application using WebRTC", // Updated description
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    // Apply font variables directly to the <html> tag for global availability
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable}`}>
      {/* Apply base font style (sans-serif) to the body */}
      <body
        className={`font-sans antialiased`} // Use font-sans utility, Tailwind maps it to --font-geist-sans
      >
        {children}
        <Toaster /> {/* Add Toaster component */}
      </body>
    </html>
  );
}

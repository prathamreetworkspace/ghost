import type { Metadata } from "next";
// Corrected import for Geist Sans font
import { Geist_Sans as GeistSans } from "geist/font/sans";
import { Geist_Mono as GeistMono } from "geist/font/mono"; // Corrected import for Geist Mono
import "./globals.css";
import { Toaster } from "@/components/ui/toaster"; // Import Toaster

// Instantiate fonts with variables
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
    <html lang="en">
      {/* Apply font variables to the body */}
      <body
        className={`${geistSans.variable} ${geistMono.variable} font-sans antialiased`} // Use font-sans utility
      >
        {children}
        <Toaster /> {/* Add Toaster component */}
      </body>
    </html>
  );
}

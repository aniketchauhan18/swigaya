import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import Link from "next/link";
import { SiteNav } from "@/components/SiteNav";
import { cn } from "@/lib/utils";
import "./globals.css";

const sans = Inter({ subsets: ["latin"], variable: "--font-sans", display: "swap" });

export const metadata: Metadata = {
  title: "Swigaya - Smart Swiggy Agent",
  description:
    "Decide whether to order food on Swiggy or cook with Instamart groceries, based on your budget, diet, pantry and time.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#171717",
};

const shell = "mx-auto w-full max-w-3xl px-5 sm:px-8";

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={cn("dark", sans.variable)}>
      <body className="flex min-h-dvh flex-col antialiased">
        <header className="sticky top-0 z-50 border-b border-border bg-background pt-[env(safe-area-inset-top)]">
          <div className={cn(shell, "flex min-h-14 flex-wrap items-center justify-between gap-x-3 gap-y-1 py-2")}>
            <Link href="/" className="font-heading text-lg font-semibold tracking-tight">
              Swigaya
            </Link>
            <SiteNav />
          </div>
        </header>
        <main className={cn(shell, "flex-1 py-8 sm:py-10")}>{children}</main>
        <footer className={cn(shell, "pb-[max(2.5rem,env(safe-area-inset-bottom))] text-xs text-muted-foreground")}>
          Swigaya never pays or places orders. It can only add items to your cart after you approve them.
        </footer>
      </body>
    </html>
  );
}

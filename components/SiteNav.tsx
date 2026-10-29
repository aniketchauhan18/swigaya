"use client";

import { IconMenu2, IconX } from "@tabler/icons-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const nav = [
  { href: "/", label: "Home" },
  { href: "/cart", label: "Cart" },
  { href: "/history", label: "History" },
];

export function SiteNav() {
  const path = usePathname();
  const [open, setOpen] = useState(false);
  const [connected, setConnected] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/swiggy/status");
      const data = (await res.json()) as { connected?: boolean };
      setConnected(Boolean(data.connected));
    } catch {
      setConnected(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load, path]);

  useEffect(() => {
    setOpen(false);
  }, [path]);

  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  async function disconnect() {
    setBusy(true);
    try {
      await fetch("/api/swiggy/auth/disconnect", { method: "POST" });
      setConnected(false);
      setOpen(false);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <nav className="hidden items-center gap-1 sm:flex" aria-label="Primary">
        <Links path={path} />
        <Account connected={connected} busy={busy} onDisconnect={() => void disconnect()} />
      </nav>

      <Button
        variant="ghost"
        size="icon"
        className="size-11 sm:hidden"
        aria-expanded={open}
        aria-controls="mobile-nav"
        aria-label={open ? "Close menu" : "Open menu"}
        onClick={() => setOpen((value) => !value)}
      >
        {open ? <IconX /> : <IconMenu2 />}
      </Button>

      {open &&
        createPortal(
        <div id="mobile-nav" className="fixed inset-0 z-40 flex flex-col bg-background px-5 pt-[calc(4.5rem+env(safe-area-inset-top))] sm:hidden">
          <nav className="flex flex-col gap-2" aria-label="Primary">
            {nav.map((item) => {
              const active = item.href === "/" ? path === "/" : path.startsWith(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "flex min-h-11 items-center rounded-lg px-3 text-lg font-medium",
                    active ? "bg-muted text-foreground" : "text-muted-foreground",
                  )}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>
          <div className="mt-6 border-t border-border pt-6">
            <Account connected={connected} busy={busy} onDisconnect={() => void disconnect()} stacked />
          </div>
        </div>,
        document.body,
        )}
    </>
  );
}

function Links({ path }: { path: string }) {
  return (
    <>
      {nav.map((item) => {
        const active = item.href === "/" ? path === "/" : path.startsWith(item.href);
        return (
          <Button
            key={item.href}
            variant="ghost"
            size="sm"
            nativeButton={false}
            render={<Link href={item.href} aria-current={active ? "page" : undefined} />}
            className={cn(active && "bg-muted text-foreground")}
          >
            {item.label}
          </Button>
        );
      })}
    </>
  );
}

function Account({
  connected,
  busy,
  onDisconnect,
  stacked,
}: {
  connected: boolean | null;
  busy: boolean;
  onDisconnect: () => void;
  stacked?: boolean;
}) {
  if (connected === null) return null;
  if (!connected) {
    return (
      <a
        href="/api/swiggy/auth/start"
        className={cn(
          "inline-flex items-center font-medium text-primary",
          stacked ? "min-h-11 px-3 text-lg" : "h-7 rounded-lg px-2.5 text-[0.8rem] hover:bg-muted",
        )}
      >
        Connect Swiggy
      </a>
    );
  }
  return (
    <div className={cn("flex items-center", stacked && "flex-col items-start gap-2")}>
      <span className={cn("text-muted-foreground", stacked ? "px-3 text-sm" : "px-2 text-[0.8rem]")}>Swiggy connected</span>
      <Button variant="ghost" size={stacked ? "lg" : "sm"} className={stacked ? "min-h-11 px-3" : undefined} disabled={busy} onClick={onDisconnect}>
        Disconnect
      </Button>
    </div>
  );
}

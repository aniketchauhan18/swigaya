"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Banner } from "./Badges";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "cn";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { inr } from "@/lib/format";

interface CatalogItem {
  id: string;
  name: string;
  priceInr: number;
  detail: string | null;
  imageUrl: string | null;
}

interface Catalog {
  title: string;
  subtitle: string;
  items: CatalogItem[];
}

export default function ExploreMenu({ requestId, source }: { requestId: string; source: "food" | "grocery" }) {
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [added, setAdded] = useState<Record<string, boolean>>({});

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/catalog?requestId=${encodeURIComponent(requestId)}&source=${source}`);
        const data = (await res.json()) as Catalog & { error?: string };
        if (cancelled) return;
        if (!res.ok) {
          setError(data.error ?? "Could not load Swiggy items.");
          return;
        }
        setCatalog(data);
      } catch {
        if (!cancelled) setError("Network error. Please try again.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [requestId, source]);

  async function add(itemId: string) {
    setBusy(itemId);
    setError(null);
    try {
      const res = await fetch("/api/cart/item", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requestId, source, itemId, confirm: true }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        setError(data.error ?? "Could not add this item.");
        return;
      }
      setAdded((prev) => ({ ...prev, [itemId]: true }));
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="flex w-full flex-col gap-6">
      <div className="flex flex-col gap-3">
        <Link href={`/results/${requestId}`} className={cn(buttonVariants({ variant: "link" }), "h-auto w-fit px-0")}>
          Back to results
        </Link>
        {catalog ? (
          <header className="flex flex-col gap-1">
            <h1 className="text-3xl font-semibold tracking-tight">{catalog.title}</h1>
            <p className="text-sm text-muted-foreground">{catalog.subtitle}</p>
          </header>
        ) : (
          !error && <Skeleton className="h-10 w-2/3" />
        )}
      </div>

      {error && <Banner tone="error">{error}</Banner>}

      {!catalog && !error && (
        <div className="flex flex-col gap-3">
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
        </div>
      )}

      {catalog && (
        <ul className="flex flex-col divide-y divide-border rounded-xl bg-card ring-1 ring-foreground/10">
          {catalog.items.map((item) => (
            <li key={item.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
              {item.imageUrl && (
                <img
                  src={item.imageUrl}
                  alt=""
                  width={64}
                  height={64}
                  className="size-16 shrink-0 rounded-lg object-cover outline outline-1 -outline-offset-1 outline-white/10"
                />
              )}
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium leading-snug">{item.name}</p>
                {item.detail && <p className="text-xs text-muted-foreground">{item.detail}</p>}
              </div>
              <p className="text-sm tabular-nums">{inr(item.priceInr)}</p>
              <Button size="sm" disabled={busy === item.id || added[item.id]} onClick={() => add(item.id)}>
                {busy === item.id && <Spinner data-icon="inline-start" />}
                {added[item.id] ? "Added" : "Add"}
              </Button>
            </li>
          ))}
        </ul>
      )}

      {Object.values(added).some(Boolean) && (
        <Link href="/cart" className={cn(buttonVariants(), "w-fit")}>
          View cart
        </Link>
      )}
    </div>
  );
}

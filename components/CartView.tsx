"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Banner, DemoBadge } from "./Badges";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import { Field, FieldLabel } from "@/components/ui/field";
import { Skeleton } from "@/components/ui/skeleton";

interface CartItem {
  itemId: string;
  name: string;
  quantity: number;
  priceInr: number;
  source: "food" | "grocery";
  restaurantName?: string | null;
  imageUrl?: string | null;
}
interface Cart {
  items: CartItem[];
  totalInr: number;
  message?: string;
  dataSource: "mock" | "live";
}

const inr = (n: number) => `₹${Math.round(n).toLocaleString("en-IN")}`;

export default function CartView({ canConnect }: { canConnect: boolean }) {
  const [cart, setCart] = useState<Cart | null>(null);
  const [demo, setDemo] = useState(false);
  const [needsConnect, setNeedsConnect] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ack, setAck] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      const res = await fetch("/api/cart/get");
      const data = (await res.json()) as Record<string, any>;
      if (!res.ok) throw new Error(data.error ?? "Could not load cart");
      setCart(data.cart);
      setDemo(Boolean(data.demoData));
      setNeedsConnect(Boolean(data.needsConnect));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function mutate(kind: "update" | "remove", item: CartItem, quantity?: number) {
    setBusy(item.itemId);
    setError(null);
    try {
      const res = await fetch(`/api/cart/${kind}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ source: item.source, itemId: item.itemId, ...(quantity !== undefined ? { quantity } : {}) }),
      });
      const data = (await res.json()) as Record<string, any>;
      if (!res.ok) throw new Error(data.error ?? "Could not update cart");
      setCart(data.cart);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  if (loading) {
    return (
      <div className="flex flex-col gap-3">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-24 w-full" />
      </div>
    );
  }

  const items = cart?.items ?? [];
  const total = cart?.totalInr ?? 0;
  const groups = (["food", "grocery"] as const)
    .map((s) => ({ source: s, items: items.filter((i) => i.source === s) }))
    .filter((g) => g.items.length);

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-3xl font-semibold text-balance">Your cart</h1>
        {demo && <DemoBadge />}
      </div>

      {needsConnect && canConnect && (
        <Banner tone="info">
          Connect your Swiggy account to see your live cart.{" "}
          <a className="font-medium underline" href="/api/swiggy/auth/start">
            Connect Swiggy
          </a>
        </Banner>
      )}
      {demo && canConnect && (
        <Banner tone="info">
          You are viewing a demo cart.{" "}
          <a className="font-medium underline" href="/api/swiggy/auth/start">
            Connect your Swiggy account
          </a>{" "}
          to use live data.
        </Banner>
      )}
      {error && <Banner tone="error">{error}</Banner>}

      {groups.length === 0 ? (
        <Empty className="bg-card">
          <EmptyHeader>
            <EmptyTitle>Your cart is empty</EmptyTitle>
            <EmptyDescription>Approve a recommendation to put items here.</EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Button nativeButton={false} render={<Link href="/" />}>
              Find the best option
            </Button>
          </EmptyContent>
        </Empty>
      ) : (
        groups.map((g) => (
          <Card key={g.source} aria-label={g.source}>
            <CardHeader>
              <CardTitle className="font-heading text-lg">
                {g.source === "food" ? `Swiggy Food${g.items[0]?.restaurantName ? ` · ${g.items[0].restaurantName}` : ""}` : "Instamart"}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="flex flex-col">
                {g.items.map((i) => (
                  <li key={`${i.source}:${i.itemId}`}>
                    <div className="flex flex-col gap-3 py-3 sm:flex-row sm:items-center sm:justify-between">
                      <div className="flex min-w-0 items-center gap-3">
                        {i.imageUrl && (
                          <img
                            src={i.imageUrl}
                            alt=""
                            width={56}
                            height={56}
                            className="size-14 shrink-0 rounded-lg object-cover outline outline-1 -outline-offset-1 outline-white/10"
                          />
                        )}
                        <div className="min-w-0">
                        <p className="font-medium">{i.name}</p>
                        <p className="text-xs text-muted-foreground">{inr(i.priceInr)} each</p>
                        </div>
                      </div>
                      <div className="flex flex-wrap items-center gap-3">
                        <div className="flex items-center rounded-lg border">
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            aria-label={`Decrease ${i.name}`}
                            disabled={busy === i.itemId || i.quantity <= 1}
                            onClick={() => mutate("update", i, i.quantity - 1)}
                          >
                            -
                          </Button>
                          <span className="w-8 text-center text-sm tabular-nums" aria-live="polite">
                            {i.quantity}
                          </span>
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            aria-label={`Increase ${i.name}`}
                            disabled={busy === i.itemId || i.quantity >= 20}
                            onClick={() => mutate("update", i, i.quantity + 1)}
                          >
                            +
                          </Button>
                        </div>
                        <span className="w-20 text-right text-sm tabular-nums">{inr(i.priceInr * i.quantity)}</span>
                        <Button variant="destructive" size="sm" disabled={busy === i.itemId} onClick={() => mutate("remove", i)}>
                          Remove
                        </Button>
                      </div>
                    </div>
                    <Separator />
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        ))
      )}

      {items.length > 0 && (
        <Card aria-label="Checkout">
          <CardContent className="flex flex-col gap-4">
            <div className="flex justify-between text-lg font-semibold">
              <span>Estimated total</span>
              <span className="tabular-nums">{inr(total)}</span>
            </div>
            <Banner tone="warn">
              This MVP does not place orders or take payments. It only prepares your cart. To pay, you must continue in the Swiggy app.
            </Banner>
            <Field orientation="horizontal">
              <Checkbox id="ack" checked={ack} onCheckedChange={(checked) => setAck(checked === true)} />
              <FieldLabel htmlFor="ack" className="font-normal">
                I understand no order has been placed and I will review and pay in the Swiggy app myself.
              </FieldLabel>
            </Field>
            <div className="flex flex-wrap gap-2">
              {groups.some((g) => g.source === "food") && (
                <Button
                  size="lg"
                  className="w-fit"
                  disabled={!ack}
                  nativeButton={false}
                  render={<a href="https://www.swiggy.com/checkout" target="_blank" rel="noreferrer" />}
                >
                  Review and pay for food
                </Button>
              )}
              {groups.some((g) => g.source === "grocery") && (
                <Button
                  size="lg"
                  variant="secondary"
                  className="w-fit"
                  disabled={!ack}
                  nativeButton={false}
                  render={<a href="https://www.swiggy.com/instamart/cart" target="_blank" rel="noreferrer" />}
                >
                  Review Instamart cart
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

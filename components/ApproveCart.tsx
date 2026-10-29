"use client";

import Link from "next/link";
import { useState } from "react";
import { Banner } from "./Badges";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Spinner } from "@/components/ui/spinner";

interface Item {
  item_id: string;
  name: string;
  quantity: number;
  line_total_inr: number;
}

const inr = (n: number) => `₹${Math.round(n).toLocaleString("en-IN")}`;

export default function ApproveCart({
  requestId,
  source,
  items,
  total,
  alreadyAdded,
  demoData,
}: {
  requestId: string;
  source: "food" | "grocery";
  items: Item[];
  total: number;
  alreadyAdded: boolean;
  demoData: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(alreadyAdded ? "These items are already in your cart." : null);

  async function approve() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/cart/add", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requestId, confirm: true }),
      });
      const data = (await res.json()) as Record<string, any>;
      if (!res.ok) {
        setError(data.error ?? "Could not add to cart.");
        return;
      }
      setDone(data.cart?.message ?? "Added to your Swiggy cart. No order has been placed.");
      setOpen(false);
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card aria-label="Cart preview">
      <CardHeader>
        <CardTitle className="font-heading text-lg">Cart preview ({source === "food" ? "Swiggy Food" : "Instamart"})</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <ul className="flex flex-col text-sm">
          {items.map((i) => (
            <li key={i.item_id}>
              <div className="flex justify-between py-2">
                <span>
                  {i.name} <span className="text-muted-foreground">x {i.quantity}</span>
                </span>
                <span className="tabular-nums">{inr(i.line_total_inr)}</span>
              </div>
              <Separator />
            </li>
          ))}
          <li className="flex justify-between py-2 font-semibold">
            <span>Estimated total (incl. delivery and taxes)</span>
            <span className="tabular-nums">{inr(total)}</span>
          </li>
        </ul>

        {done ? (
          <div className="flex flex-col gap-3">
            <Banner tone="success">
              {done} {demoData ? "(Demo cart)" : ""}
            </Banner>
            <Button nativeButton={false} render={<Link href="/cart" />} className="w-fit">
              View cart
            </Button>
          </div>
        ) : (
          <AlertDialog open={open} onOpenChange={setOpen}>
            <AlertDialogTrigger render={<Button size="lg" className="w-fit" />}>Add recommended items to Swiggy cart</AlertDialogTrigger>
            <p className="text-xs text-muted-foreground">This only adds items to your cart. It does not pay or place an order.</p>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Add these items to your cart?</AlertDialogTitle>
                <AlertDialogDescription>
                  Estimated total {inr(total)}. You will review and pay in the Swiggy app. Nothing is ordered automatically.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <ul className="flex flex-col gap-1 text-sm">
                {items.map((i) => (
                  <li key={i.item_id} className="flex justify-between">
                    <span>
                      {i.name} x {i.quantity}
                    </span>
                    <span className="tabular-nums">{inr(i.line_total_inr)}</span>
                  </li>
                ))}
              </ul>
              <AlertDialogFooter>
                <AlertDialogCancel disabled={loading}>Cancel</AlertDialogCancel>
                <AlertDialogAction disabled={loading} onClick={approve}>
                  {loading && <Spinner data-icon="inline-start" />}
                  {loading ? "Adding" : "Yes, add to cart"}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        )}

        {error && <Banner tone="error">{error}</Banner>}
      </CardContent>
    </Card>
  );
}

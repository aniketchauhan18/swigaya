import Link from "next/link";
import { DemoBadge } from "@/components/Badges";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { getDb } from "@/lib/db";
import { inr } from "@/lib/format";
import { loadHistory, summarizeWeekly } from "@/lib/history";

export const dynamic = "force-dynamic";

const label = (o: "food" | "grocery" | null) => (o === "food" ? "Order food" : o === "grocery" ? "Buy groceries" : null);

export default async function HistoryPage() {
  const db = getDb();
  let entries;
  try {
    entries = await loadHistory(db);
  } finally {
    await db.$disconnect();
  }
  const weekly = summarizeWeekly(entries).filter((w, i) => i < 4 || w.orders > 0);
  const added = entries.filter((e) => e.selectedOption);
  const totalAdded = added.reduce((s, e) => s + e.totalInr, 0);

  return (
    <div className="flex flex-col gap-8">
      <header className="flex w-full flex-col gap-1">
        <h1 className="text-3xl font-semibold text-balance">History</h1>
        <p className="max-w-[68ch] text-sm text-muted-foreground">
          Spending shows the estimated total of carts you approved. Swigaya does not place orders, so this is what you
          prepared to buy, not what you paid.
        </p>
      </header>

      <Card aria-label="Weekly spending">
        <CardHeader>
          <CardTitle className="font-heading text-lg">Weekly spending summary</CardTitle>
          <p className="text-sm text-muted-foreground">
            All time: <span className="font-semibold text-foreground">{inr(totalAdded)}</span> across {added.length}{" "}
            {added.length === 1 ? "cart" : "carts"}
          </p>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Week of</TableHead>
                <TableHead className="text-right">Carts</TableHead>
                <TableHead className="text-right">Food</TableHead>
                <TableHead className="text-right">Groceries</TableHead>
                <TableHead className="text-right">Total</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {weekly.map((w) => (
                <TableRow key={w.weekStart}>
                  <TableCell>
                    {new Date(w.weekStart).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" })}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{w.orders}</TableCell>
                  <TableCell className="text-right tabular-nums">{inr(w.foodInr)}</TableCell>
                  <TableCell className="text-right tabular-nums">{inr(w.groceryInr)}</TableCell>
                  <TableCell className="text-right font-medium tabular-nums">{inr(w.totalInr)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <section aria-label="Previous requests" className="flex flex-col gap-3">
        <h2 className="font-heading text-lg font-semibold">Previous requests</h2>
        {entries.length === 0 ? (
          <Empty className="bg-card">
            <EmptyHeader>
              <EmptyTitle>No requests yet</EmptyTitle>
              <EmptyDescription>Start with a budget and how soon you want to eat.</EmptyDescription>
            </EmptyHeader>
            <EmptyContent>
              <Button nativeButton={false} render={<Link href="/" />}>
                Find the best option
              </Button>
            </EmptyContent>
          </Empty>
        ) : (
          <ul className="flex flex-col gap-3">
            {entries.map((e) => (
              <li key={e.id}>
                <Card size="sm">
                  <CardHeader>
                    <p className="text-sm">{e.prompt}</p>
                    <time className="text-xs text-muted-foreground" dateTime={e.createdAt}>
                      {new Date(e.createdAt).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}
                    </time>
                  </CardHeader>
                  <CardContent className="flex flex-wrap items-center gap-2">
                    {e.status === "NEEDS_INFO" ? (
                      <Badge variant="secondary">Needed more info</Badge>
                    ) : (
                      <>
                        {e.recommended && <Badge variant="outline">Recommended: {label(e.recommended)}</Badge>}
                        {e.selectedOption ? (
                          <Badge variant="secondary">
                            Selected: {label(e.selectedOption)} · {inr(e.totalInr)}
                          </Badge>
                        ) : (
                          <Badge variant="secondary">Not added to cart</Badge>
                        )}
                        {e.demoData && <DemoBadge />}
                        <Button variant="link" size="sm" className="ml-auto" nativeButton={false} render={<Link href={`/results/${e.id}`} />}>
                          View
                        </Button>
                      </>
                    )}
                  </CardContent>
                </Card>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

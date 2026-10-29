import Link from "next/link";
import { notFound } from "next/navigation";
import ApproveCart from "@/components/ApproveCart";
import { Banner, DemoBadge } from "@/components/Badges";
import { FoodCard, GroceryCard } from "@/components/OptionCards";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { loadRequest } from "@/lib/agent/repo";
import { getDb } from "@/lib/db";
import { inr } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function ResultsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = getDb();
  let stored;
  let alreadyAdded = false;
  try {
    stored = await loadRequest(db, id);
    if (stored) alreadyAdded = (await db.cartEvent.count({ where: { requestId: id, action: "ADD" } })) > 0;
  } finally {
    await db.$disconnect();
  }
  if (!stored) notFound();

  const rec = stored.recommendation;
  const c = stored.constraints;
  if (!rec || !c) {
    return (
      <div className="flex flex-col gap-4">
        <Banner tone="warn">This request is waiting for more information. Please start again from the home page.</Banner>
        <Button variant="link" className="w-fit" nativeButton={false} render={<Link href="/" />}>
          Back to home
        </Button>
      </div>
    );
  }

  const isFood = rec.recommendation === "food";
  const demo = rec.data_source === "mock";

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-3">
        <p className="text-sm text-muted-foreground">&ldquo;{stored.rawPrompt}&rdquo;</p>
        <div className="flex flex-wrap items-center gap-3">
          <Badge data-testid="recommendation-badge">{isFood ? "Order food" : "Buy groceries"}</Badge>
          <span className="text-sm text-muted-foreground">Confidence {rec.confidence}%</span>
          {demo && <DemoBadge />}
        </div>
        <p className="text-sm text-muted-foreground">
          Budget {c.budget_inr ? inr(c.budget_inr) : "not set"}, {c.diet ? c.diet.replace("_", "-") : "any diet"}, within{" "}
          {c.max_wait_minutes} min, {c.people_count} {c.people_count === 1 ? "person" : "people"}
          {c.pantry_items.length ? `, pantry: ${c.pantry_items.join(", ")}` : ""}
        </p>
      </header>

      <Card aria-label="Agent reasoning">
        <CardHeader>
          <CardTitle className="font-heading text-lg">Why this option</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          <p>{rec.explanation}</p>
          {rec.reasoning !== rec.explanation && <p className="text-sm text-muted-foreground">{rec.reasoning}</p>}
        </CardContent>
      </Card>

      {rec.warnings.length > 0 && (
        <div className="flex flex-col gap-2">
          {rec.warnings.map((w) => (
            <Banner key={w} tone="warn">
              {w}
            </Banner>
          ))}
        </div>
      )}

      <div className="flex w-full flex-col gap-5">
        <FoodCard
          option={rec.food_option}
          recommended={isFood}
          budget={c.budget_inr}
          wait={c.max_wait_minutes}
          href={rec.food_option ? `/results/${stored.id}/explore/food` : undefined}
        />
        <GroceryCard
          option={rec.grocery_option}
          recommended={!isFood}
          budget={c.budget_inr}
          wait={c.max_wait_minutes}
          href={rec.grocery_option ? `/results/${stored.id}/explore/grocery` : undefined}
        />
      </div>

      <ApproveCart
        requestId={stored.id}
        source={rec.recommended_cart.source}
        items={rec.recommended_cart.items}
        total={rec.recommended_cart.estimated_total_inr}
        alreadyAdded={alreadyAdded}
        demoData={demo}
      />

      <p className="text-xs text-muted-foreground">
        Prices and delivery times come from {demo ? "sample demo data" : "Swiggy"} and may change. Totals are estimates; the
        Swiggy cart shows the final amount.
      </p>
    </div>
  );
}

import Link from "next/link";
import { inr, mins } from "@/lib/format";
import type { FoodOption, GroceryOption, LineItem } from "@/lib/agent/schemas";
import { Badge } from "@/components/ui/badge";
import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";

function ItemsTable({ items, subtotal, fees, total }: { items: LineItem[]; subtotal: number; fees: number; total: number }) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="text-xs font-medium tracking-normal text-muted-foreground">Item</TableHead>
          <TableHead className="text-right text-xs font-medium tracking-normal text-muted-foreground">Qty</TableHead>
          <TableHead className="text-right text-xs font-medium tracking-normal text-muted-foreground">Price</TableHead>
          <TableHead className="text-right text-xs font-medium tracking-normal text-muted-foreground">Total</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {items.map((i) => (
          <TableRow key={i.item_id}>
            <TableCell className="whitespace-normal text-sm leading-snug">{i.name}</TableCell>
            <TableCell className="text-right text-sm tabular-nums">{i.quantity}</TableCell>
            <TableCell className="text-right text-sm tabular-nums">{inr(i.price_inr)}</TableCell>
            <TableCell className="text-right text-sm tabular-nums">{inr(i.line_total_inr)}</TableCell>
          </TableRow>
        ))}
      </TableBody>
      <TableFooter>
        <TableRow>
          <TableCell colSpan={3} className="text-sm text-muted-foreground">Items subtotal</TableCell>
          <TableCell className="text-right text-sm tabular-nums">{inr(subtotal)}</TableCell>
        </TableRow>
        <TableRow>
          <TableCell colSpan={3} className="text-sm text-muted-foreground">Estimated delivery and taxes</TableCell>
          <TableCell className="text-right text-sm tabular-nums">{inr(fees)}</TableCell>
        </TableRow>
        <TableRow>
          <TableCell colSpan={3} className="text-sm font-medium">
            Estimated total
          </TableCell>
          <TableCell className="text-right text-sm font-medium tabular-nums">{inr(total)}</TableCell>
        </TableRow>
      </TableFooter>
    </Table>
  );
}

function Fact({ label, value, ok }: { label: string; value: string; ok?: boolean }) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className={ok === false ? "text-sm font-medium text-destructive tabular-nums" : "text-sm font-medium tabular-nums"}>{value}</dd>
    </div>
  );
}

function ProsCons({ pros, cons }: { pros: string[]; cons: string[] }) {
  if (!pros.length && !cons.length) return null;
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {pros.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <p className="text-xs text-muted-foreground">Why it fits</p>
          <ul className="flex flex-col gap-1 text-sm leading-snug">
            {pros.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
        </div>
      )}
      {cons.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <p className="text-xs text-muted-foreground">Tradeoffs</p>
          <ul className="flex flex-col gap-1 text-sm leading-snug text-muted-foreground">
            {cons.map((c) => (
              <li key={c}>{c}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function OptionCard({
  title,
  recommended,
  href,
  children,
}: {
  title: string;
  recommended: boolean;
  href?: string;
  children: React.ReactNode;
}) {
  const card = (
    <Card aria-label={title} className={recommended ? "w-full ring-1 ring-primary" : "w-full"}>
      <CardHeader>
        <CardTitle className="text-sm font-medium text-muted-foreground">{title}</CardTitle>
        {recommended && (
          <CardAction>
            <Badge>Recommended</Badge>
          </CardAction>
        )}
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        {children}
        {href && <p className="text-sm font-medium text-primary">See more items and add them to your cart</p>}
      </CardContent>
    </Card>
  );
  if (!href) return card;
  return (
    <Link href={href} className="block w-full rounded-xl outline-none focus-visible:ring-3 focus-visible:ring-ring/50">
      {card}
    </Link>
  );
}

export function FoodCard({
  option,
  recommended,
  budget,
  wait,
  href,
}: {
  option: FoodOption | null;
  recommended: boolean;
  budget: number | null;
  wait: number;
  href?: string;
}) {
  if (!option) {
    return (
      <OptionCard title="Order food" recommended={false}>
        <Empty className="border-0 p-0">
          <EmptyHeader>
            <EmptyTitle>No restaurant matched</EmptyTitle>
            <EmptyDescription>Nothing fit your diet, budget and time.</EmptyDescription>
          </EmptyHeader>
        </Empty>
      </OptionCard>
    );
  }
  return (
    <OptionCard title="Order food" recommended={recommended} href={href}>
      <div className="flex flex-col gap-1">
        <p className="text-xl font-semibold tracking-tight">{option.restaurant_name}</p>
        <p className="text-sm text-muted-foreground">{option.restaurant_rating ? `${option.restaurant_rating.toFixed(1)} rating` : "Not rated"}</p>
      </div>
      <dl className="grid grid-cols-3 gap-4 border-y border-border py-3">
        <Fact label={`Limit ${mins(wait)}`} value={mins(option.estimated_delivery_minutes)} ok={option.fits_time} />
        <Fact label="Total" value={budget ? `${inr(option.estimated_total_inr)} of ${inr(budget)}` : inr(option.estimated_total_inr)} ok={option.fits_budget} />
        <Fact label="Diet" value={option.diet_compatible ? "Compatible" : "Mismatch"} ok={option.diet_compatible} />
      </dl>
      <ItemsTable items={option.items} subtotal={option.items_subtotal_inr} fees={option.estimated_fees_inr} total={option.estimated_total_inr} />
      <ProsCons pros={option.pros} cons={option.cons} />
    </OptionCard>
  );
}

export function GroceryCard({
  option,
  recommended,
  budget,
  wait,
  href,
}: {
  option: GroceryOption | null;
  recommended: boolean;
  budget: number | null;
  wait: number;
  href?: string;
}) {
  if (!option) {
    return (
      <OptionCard title="Buy groceries" recommended={false}>
        <Empty className="border-0 p-0">
          <EmptyHeader>
            <EmptyTitle>No recipe available</EmptyTitle>
            <EmptyDescription>Instamart did not have the ingredients for a suitable recipe.</EmptyDescription>
          </EmptyHeader>
        </Empty>
      </OptionCard>
    );
  }
  return (
    <OptionCard title="Buy groceries" recommended={recommended} href={href}>
      <div className="flex flex-col gap-1">
        <p className="text-xl font-semibold tracking-tight">{option.suggested_recipe}</p>
        <p className="text-sm leading-snug text-muted-foreground">
          {option.store_name} · {mins(option.estimated_delivery_minutes)} delivery, about {mins(option.prep_minutes)} cooking
        </p>
      </div>
      <dl className="grid grid-cols-3 gap-4 border-y border-border py-3">
        <Fact label={`Limit ${mins(wait)}`} value={mins(option.ready_in_minutes)} ok={option.fits_time} />
        <Fact label="Total" value={budget ? `${inr(option.estimated_total_inr)} of ${inr(budget)}` : inr(option.estimated_total_inr)} ok={option.fits_budget} />
        <Fact label="Meals" value={String(option.meals_possible)} />
      </dl>
      {option.pantry_used.length > 0 && (
        <p>
          <span className="font-medium">From your pantry: </span>
          {option.pantry_used.join(", ")}
        </p>
      )}
      <ItemsTable items={option.items} subtotal={option.items_subtotal_inr} fees={option.estimated_fees_inr} total={option.estimated_total_inr} />
      {option.other_recipe_ideas.length > 0 && (
        <p>
          <span className="font-medium">Other ideas: </span>
          {option.other_recipe_ideas.join(", ")}
        </p>
      )}
      <ProsCons pros={option.pros} cons={option.cons} />
    </OptionCard>
  );
}

"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Banner } from "./Badges";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";

const CHIPS: Array<{ label: string; apply: (s: FormState) => Partial<FormState> }> = [
  { label: "₹200 dinner", apply: (s) => ({ prompt: append(s.prompt, "I have ₹200 for dinner."), budget: "200" }) },
  { label: "High-protein lunch", apply: (s) => ({ prompt: append(s.prompt, "I want a high-protein lunch.") }) },
  {
    label: "Use my pantry items",
    apply: (s) => ({ prompt: append(s.prompt, "Use the pantry items I already have."), showFilters: true }),
  },
  { label: "Vegetarian only", apply: (s) => ({ prompt: append(s.prompt, "I'm vegetarian."), diet: "vegetarian" }) },
];

const DIETS = [
  { value: "vegetarian", label: "Vegetarian" },
  { value: "vegan", label: "Vegan" },
  { value: "eggetarian", label: "Eggetarian" },
  { value: "non_vegetarian", label: "Non-vegetarian" },
];

interface FormState {
  prompt: string;
  budget: string;
  diet: string;
  wait: string;
  people: string;
  pantry: string;
  showFilters: boolean;
}

const EXAMPLE =
  "I have ₹250, I'm vegetarian, I need dinner within 30 minutes, and I already have rice, dal, onion, and basic spices. What should I do?";

function append(existing: string, extra: string) {
  return existing.trim() ? `${existing.trim()} ${extra}` : extra;
}

export default function PromptForm() {
  const router = useRouter();
  const [s, setS] = useState<FormState>({
    prompt: "",
    budget: "",
    diet: "",
    wait: "",
    people: "",
    pantry: "",
    showFilters: false,
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const [question, setQuestion] = useState<string | null>(null);
  const [answer, setAnswer] = useState("");
  const [noOptions, setNoOptions] = useState<string | null>(null);

  const set = (patch: Partial<FormState>) => setS((prev) => ({ ...prev, ...patch }));

  function filters() {
    const f: Record<string, unknown> = {};
    if (s.budget) f.budget_inr = Number(s.budget);
    if (s.diet) f.diet = s.diet;
    if (s.wait) f.max_wait_minutes = Number(s.wait);
    if (s.people) f.people_count = Number(s.people);
    const pantry = s.pantry
      .split(",")
      .map((x) => x.trim())
      .filter(Boolean);
    if (pantry.length) f.pantry_items = pantry;
    return f;
  }

  async function submit(promptText: string) {
    setLoading(true);
    setError(null);
    setErrorCode(null);
    setNoOptions(null);
    try {
      const res = await fetch("/api/agent/plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: promptText, filters: filters() }),
      });
      const data = (await res.json()) as Record<string, any>;
      if (!res.ok) {
        setError(data.error ?? "Something went wrong. Please try again.");
        setErrorCode(typeof data.code === "string" ? data.code : null);
        return;
      }
      if (data.status === "needs_info") {
        setQuestion(data.question);
        return;
      }
      if (data.status === "no_options") {
        setNoOptions(data.message);
        setQuestion(null);
        return;
      }
      router.push(`/results/${data.requestId}`);
    } catch {
      setError("Network error. Please check your connection and try again.");
    } finally {
      setLoading(false);
    }
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (s.prompt.trim().length < 3) {
      setError("Tell me what you need, for example your budget, diet and how soon you want to eat.");
      return;
    }
    setQuestion(null);
    void submit(s.prompt.trim());
  }

  function onAnswer(e: React.FormEvent) {
    e.preventDefault();
    const a = answer.trim();
    if (!a) return;
    const asBudget = /budget/i.test(question ?? "") && /^\d+$/.test(a) ? `My budget is ₹${a}.` : a;
    const combined = `${s.prompt.trim()} ${asBudget}`;
    set({ prompt: combined });
    setAnswer("");
    setQuestion(null);
    void submit(combined);
  }

  return (
    <div className="flex flex-col gap-5">
      <form onSubmit={onSubmit} className="flex flex-col gap-4">
        <Field>
          <FieldLabel htmlFor="prompt" className="sr-only">
            What do you need?
          </FieldLabel>
          <Textarea
            id="prompt"
            value={s.prompt}
            onChange={(e) => set({ prompt: e.target.value })}
            rows={5}
            maxLength={1000}
            placeholder={`Describe your situation, e.g. "${EXAMPLE}"`}
            className="min-h-32 resize-none bg-card text-base"
          />
        </Field>

        <div className="flex flex-wrap gap-2">
          {CHIPS.map((c) => (
            <Button key={c.label} type="button" variant="secondary" size="sm" onClick={() => set(c.apply(s))}>
              {c.label}
            </Button>
          ))}
          <Button type="button" variant="outline" size="sm" onClick={() => set({ prompt: EXAMPLE })}>
            Try an example
          </Button>
        </div>

        <Collapsible open={s.showFilters} onOpenChange={(open) => set({ showFilters: open })} className="rounded-xl bg-card ring-1 ring-foreground/10">
          <CollapsibleTrigger
            className="flex w-full items-center justify-between px-4 py-3 text-sm font-medium"
            render={<button type="button" />}
          >
            Optional filters
            <span className="text-muted-foreground">{s.showFilters ? "Hide" : "Show"}</span>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <FieldGroup className="grid gap-4 border-t p-4 sm:grid-cols-2">
              <Field>
                <FieldLabel htmlFor="budget">Budget (₹)</FieldLabel>
                <Input id="budget" inputMode="numeric" min={1} type="number" value={s.budget} onChange={(e) => set({ budget: e.target.value })} placeholder="250" />
              </Field>
              <Field>
                <FieldLabel htmlFor="diet">Diet</FieldLabel>
                <Select value={s.diet || null} onValueChange={(v) => set({ diet: v ?? "" })} items={DIETS}>
                  <SelectTrigger id="diet" className="w-full">
                    <SelectValue placeholder="No preference" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      {DIETS.map((d) => (
                        <SelectItem key={d.value} value={d.value}>
                          {d.label}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </Field>
              <Field>
                <FieldLabel htmlFor="wait">Max wait (minutes)</FieldLabel>
                <Input id="wait" inputMode="numeric" min={5} max={240} type="number" value={s.wait} onChange={(e) => set({ wait: e.target.value })} placeholder="30" />
              </Field>
              <Field>
                <FieldLabel htmlFor="people">People</FieldLabel>
                <Input id="people" inputMode="numeric" min={1} max={20} type="number" value={s.people} onChange={(e) => set({ people: e.target.value })} placeholder="1" />
              </Field>
              <Field className="sm:col-span-2">
                <FieldLabel htmlFor="pantry">Pantry items (comma separated)</FieldLabel>
                <Input id="pantry" value={s.pantry} onChange={(e) => set({ pantry: e.target.value })} placeholder="rice, dal, onion, basic spices" />
              </Field>
            </FieldGroup>
          </CollapsibleContent>
        </Collapsible>

        <Button type="submit" size="lg" disabled={loading} className="w-full">
          {loading && <Spinner data-icon="inline-start" />}
          {loading ? "Checking Swiggy Food and Instamart" : "Find the best option"}
        </Button>
      </form>

      {error && (
        <Banner tone="error">
          {error}{" "}
          {errorCode === "NOT_CONNECTED" && (
            <a className="font-medium underline" href="/api/swiggy/auth/start">
              Connect Swiggy
            </a>
          )}
        </Banner>
      )}
      {noOptions && <Banner tone="warn">{noOptions}</Banner>}

      {question && (
        <form onSubmit={onAnswer} className="flex flex-col gap-3 rounded-xl bg-card p-4 ring-1 ring-foreground/10">
          <p className="font-medium">{question}</p>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Input autoFocus value={answer} onChange={(e) => setAnswer(e.target.value)} placeholder="e.g. 250" aria-label="Your answer" />
            <Button type="submit" disabled={loading}>
              Continue
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}

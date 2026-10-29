import PromptForm from "@/components/PromptForm";

export default function Home() {
  return (
    <div className="flex w-full flex-col gap-8">
      <section className="flex w-full flex-col gap-3">
        <h1 className="text-3xl font-semibold leading-[1.05] sm:text-5xl">Order in, or cook at home?</h1>
        <p className="max-w-[68ch] text-base text-muted-foreground sm:text-lg">
          Tell Swigaya your budget, diet, pantry and how soon you want to eat. It compares Swiggy Food with Instamart
          groceries and recommends the smarter option. Nothing is added to a cart until you approve it, and it never pays
          or places an order.
        </p>
      </section>
      <PromptForm />
    </div>
  );
}

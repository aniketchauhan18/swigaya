import { notFound } from "next/navigation";
import ExploreMenu from "@/components/ExploreMenu";

export const dynamic = "force-dynamic";

export default async function ExplorePage({ params }: { params: Promise<{ id: string; source: string }> }) {
  const { id, source } = await params;
  if (source !== "food" && source !== "grocery") notFound();
  return <ExploreMenu requestId={id} source={source} />;
}

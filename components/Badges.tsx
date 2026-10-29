import { IconAlertCircle, IconInfoCircle } from "@tabler/icons-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";

export function DemoBadge({ reason }: { reason?: string | null }) {
  const hint =
    reason === "not_connected"
      ? "Swiggy account not connected, showing sample data"
      : reason === "live_unavailable"
        ? "Swiggy is unavailable right now, showing sample data"
        : "Showing sample data, not live Swiggy prices";
  return (
    <Badge variant="outline" title={hint}>
      Demo data
    </Badge>
  );
}

export function Banner({
  tone = "info",
  children,
}: {
  tone?: "info" | "warn" | "error" | "success";
  children: React.ReactNode;
}) {
  return (
    <Alert variant={tone === "error" ? "destructive" : "default"} role={tone === "error" ? "alert" : "status"}>
      {tone === "error" ? <IconAlertCircle /> : <IconInfoCircle />}
      <AlertDescription className={tone === "error" ? undefined : "text-foreground"}>{children}</AlertDescription>
    </Alert>
  );
}

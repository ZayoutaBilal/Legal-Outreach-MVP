import { DashboardClient } from "@/components/dashboard-client";
import { requireSession } from "@/lib/auth";

export default async function DashboardPage() {
  await requireSession();

  return <DashboardClient />;
}

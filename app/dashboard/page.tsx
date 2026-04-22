import { DashboardClient } from "@/components/dashboard-client";
import { requireSession } from "@/lib/auth";

export default async function DashboardPage() {
  await requireSession();

  return (
    <main className="shell">
      <div className="container">
        <DashboardClient />
      </div>
    </main>
  );
}

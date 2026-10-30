import "./government.css";
import { AppShell } from "@/components/government/AppShell";
import { GovernmentProvider } from "@/components/government/GovernmentProvider";
import { hasSupabaseDatabase } from "@/server/env";

export default function GovernmentLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // No service-role key (or an explicit demo deployment) means the seeded
  // dataset is the source of truth, so the console can enter itself.
  const demoAvailable = !hasSupabaseDatabase();
  const autoDemo = demoAvailable;

  return (
    <GovernmentProvider autoDemo={autoDemo} demoAvailable={demoAvailable}>
      <AppShell>{children}</AppShell>
    </GovernmentProvider>
  );
}

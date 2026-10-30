import "./government.css";
import { AppShell } from "@/components/government/AppShell";
import { GovernmentProvider } from "@/components/government/GovernmentProvider";

export default function GovernmentLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <GovernmentProvider>
      <AppShell>{children}</AppShell>
    </GovernmentProvider>
  );
}

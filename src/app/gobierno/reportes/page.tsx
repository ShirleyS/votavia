import { Suspense } from "react";
import { ReportCasesView } from "@/components/government/ReportCasesView";

export const metadata = {
  title: "Bandeja de reportes · VotaVía Gobierno",
};

export default function ReportCasesPage() {
  return (
    <Suspense fallback={<div className="page-stack"><div className="skeleton-card"><span className="skeleton skeleton--title" /><span className="skeleton" /><span className="skeleton" /></div></div>}>
      <ReportCasesView />
    </Suspense>
  );
}

import { CaseDetailView } from "@/components/government/CaseDetailView";

export default async function CaseDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <CaseDetailView caseId={id} />;
}

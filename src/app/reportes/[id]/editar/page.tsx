import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { EditReportForm } from "@/components/report/edit-report-form";
import { getParticipant } from "@/server/auth/session";
import { getCaseService } from "@/server/services/container";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Editar reporte",
  description: "Corrige la información de un reporte que enviaste a VotaVía.",
};

type PageProps = { params: Promise<{ id: string }> };

export default async function EditarReportePage({ params }: PageProps) {
  const { id } = await params;
  const participant = await getParticipant();
  const item = await getCaseService().getCase(id, participant);
  if (!item) notFound();

  if (!participant.user_id) {
    redirect(`/login?next=${encodeURIComponent(`/reportes/${item.case_id}/editar`)}`);
  }
  if (!item.is_mine) {
    redirect(`/reportes/${item.case_id}`);
  }

  const editable = item.status === "reported" || item.status === "under_review";

  return (
    <div className="bg-surface">
      <div className="border-b border-line">
        <div className="container-page py-5">
          <Link
            href={`/reportes/${item.case_id}`}
            className="inline-flex items-center gap-1.5 text-sm font-semibold text-navy-600 hover:text-royal-700"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden /> Volver al reporte
          </Link>
        </div>
      </div>

      <div className="container-page max-w-2xl py-8">
        {!editable ? (
          <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-900">
            <p className="font-bold">Este reporte ya está en atención</p>
            <p className="mt-1 text-xs leading-relaxed">
              Para no perder el historial, los reportes que ya están asignados o en proceso no se
              editan. Agrega una observación en el reporte para dar más contexto.
            </p>
            <Link
              href={`/reportes/${item.case_id}`}
              className="mt-3 inline-flex text-xs font-semibold text-royal-700 underline"
            >
              Ir al reporte
            </Link>
          </div>
        ) : (
          <EditReportForm
            caseId={item.case_id}
            displayId={item.display_id}
            initial={{
              title: item.title,
              description: item.description,
              category: item.category,
              address_hint: item.location.address_hint ?? null,
            }}
            canWithdraw={item.status !== "closed"}
          />
        )}
      </div>
    </div>
  );
}

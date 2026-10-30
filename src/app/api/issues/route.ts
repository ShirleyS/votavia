import type { NextRequest } from "next/server";
import type {
  CaseCategory,
  CommunityVerificationStatus,
  IssueOperationalStatus,
  IssueOrigin,
} from "@/shared/votavia-contract";
import { getCaseService } from "@/server/services/container";
import { issueFiltersSchema } from "@/server/validation";
import { getParticipant } from "@/server/auth/session";
import { handleError, jsonOk } from "@/server/http";

export const dynamic = "force-dynamic";

function split(value: string | undefined) {
  return value ? (value.split(",").filter(Boolean) as string[]) : undefined;
}

export async function GET(request: NextRequest) {
  try {
    const params = issueFiltersSchema.parse(Object.fromEntries(request.nextUrl.searchParams));
    const participant = await getParticipant();

    const result = await getCaseService().listIssues({
      categories: split(params.category) as CaseCategory[] | undefined,
      operationalStatuses: split(params.operational) as IssueOperationalStatus[] | undefined,
      verificationStatuses: split(params.verification) as
        | CommunityVerificationStatus[]
        | undefined,
      origins: split(params.origin) as IssueOrigin[] | undefined,
      colonia: params.colonia,
      query: params.q,
      page: params.page,
      pageSize: params.pageSize,
      sort: params.sort,
    }, participant);

    return jsonOk(result);
  } catch (error) {
    return handleError(error);
  }
}

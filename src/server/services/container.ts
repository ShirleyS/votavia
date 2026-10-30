import { DemoCaseRepository } from "@/server/repositories/demo-store";
import { SupabaseCaseRepository } from "@/server/repositories/supabase-repository";
import type { CaseRepository } from "@/server/repositories/repository";
import { CaseService } from "@/server/services/case-service";
import { hasSupabaseDatabase } from "@/server/env";

let cached: { repo: CaseRepository; service: CaseService } | null = null;

export function getRepository(): CaseRepository {
  if (!cached) {
    const repo: CaseRepository = hasSupabaseDatabase()
      ? new SupabaseCaseRepository()
      : new DemoCaseRepository();
    cached = { repo, service: new CaseService(repo) };
  }
  return cached.repo;
}

export function getCaseService(): CaseService {
  getRepository();
  return cached!.service;
}

export function currentBackend(): "demo" | "supabase" {
  return hasSupabaseDatabase() ? "supabase" : "demo";
}

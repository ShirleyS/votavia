import { z } from "zod";
import { CASE_CATEGORIES, OBSERVATION_KINDS } from "@/shared/votavia-contract";

export const MAX_PHOTOS = 3;
export const MAX_PHOTO_BYTES = 5 * 1024 * 1024;
export const ACCEPTED_PHOTO_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;

export const createCaseSchema = z.object({
  category: z.enum(CASE_CATEGORIES),
  title: z.string().trim().min(6, "Escribe un título de al menos 6 caracteres").max(140),
  description: z
    .string()
    .trim()
    .min(15, "Cuéntanos un poco más: al menos 15 caracteres")
    .max(2000, "Máximo 2000 caracteres"),
  latitude: z.coerce.number().min(19.2).max(19.6),
  longitude: z.coerce.number().min(-99.35).max(-98.95),
  colonia: z.string().trim().min(3).max(80),
  address_hint: z.string().trim().max(160).optional().nullable(),
  has_safety_concern: z.coerce.boolean(),
  has_accessibility_concern: z.coerce.boolean(),
  email: z.union([z.string().trim().email("Escribe un correo válido"), z.literal("")]).optional(),
});

export const observationSchema = z.object({
  kind: z.enum(OBSERVATION_KINDS),
  body: z.string().trim().min(3, "Escribe al menos 3 caracteres").max(800),
});

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email("Escribe un correo válido"),
  next: z.string().optional(),
});

export const claimRequestSchema = z.object({
  case_id: z.string().trim().min(1),
  email: z.string().trim().toLowerCase().email("Escribe un correo válido"),
});

export const filtersSchema = z.object({
  category: z.string().optional(),
  status: z.string().optional(),
  colonia: z.string().optional(),
  q: z.string().optional(),
  page: z.coerce.number().int().min(1).optional(),
  pageSize: z.coerce.number().int().min(1).max(60).optional(),
  sort: z.enum(["recent", "supported"]).optional(),
  mine: z.coerce.boolean().optional(),
  supported: z.coerce.boolean().optional(),
});

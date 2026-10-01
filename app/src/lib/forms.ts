import { z } from "zod";

export type ActionState = { message: string; success?: boolean };
export const loginSchema = z.object({
  email: z.email().max(254),
  password: z.string().min(1).max(1024),
});
export const storeSchema = z.object({
  id: z.uuid().optional(),
  code: z.string().trim().min(1).max(30),
  name: z.string().trim().min(1).max(100),
  is_active: z.boolean(),
});
export const profileSchema = z.object({
  id: z.uuid(),
  name: z.string().trim().min(1).max(100),
  role: z.enum(["admin", "staff"]),
  store_id: z.uuid().nullable(),
  is_active: z.boolean(),
}).refine((p) => !p.is_active || p.role === "admin" || Boolean(p.store_id), {
  message: "有効なstaffには所属店舗が必要です。",
});

import type { Request } from "express";

export type AdminRole = "owner" | "member";

export interface AdminRecord {
  id:         string;      // matches Supabase auth user id
  email:      string;
  nome:       string;
  role:       AdminRole;
  ativo:      boolean;
  created_at: string;
}

// Augment Express so every route handler gets req.admin typed — no 'as any' casts.
declare global {
  namespace Express {
    interface Request {
      admin?: AdminRecord;
    }
  }
}

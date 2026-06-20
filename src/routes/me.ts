import { Router, type Request, type Response } from "express";
import { requireAuth } from "../auth/middleware";

const router = Router();

// GET /me
// Returns the current admin's public profile.
// requireAuth attaches req.admin; this handler just serialises it.
router.get("/", requireAuth, (req: Request, res: Response) => {
  const { email, nome, role } = req.admin!;
  return res.json({ email, nome, role });
});

export default router;

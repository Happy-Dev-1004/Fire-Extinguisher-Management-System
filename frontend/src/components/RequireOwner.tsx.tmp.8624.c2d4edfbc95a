import { Navigate, Outlet } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";

/**
 * Blocks member-role users from owner-only routes.
 * Defense-in-depth: the backend also rejects with 403.
 * Members are redirected to /dashboard with no explanation of what's there,
 * so they can't probe which routes exist.
 */
export function RequireOwner() {
  const { profile, loading } = useAuth();

  if (loading) return null;

  if (!profile || profile.role !== "owner") {
    return <Navigate to="/dashboard" replace />;
  }

  return <Outlet />;
}

import "server-only";
import { redirect } from "next/navigation";
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PermissionKey } from "@/lib/permission-modules";

// Re-exported so existing server-side imports of the module-list helpers
// from "@/lib/permissions" keep working — the actual definitions live in
// permission-modules.ts, which has no "server-only" guard so client
// components (the role permission-matrix UI) can import them too.
export {
  PermissionKey,
  PERMISSION_MODULE_KEYS,
  moduleViewPermission,
  moduleManagePermission,
  type PermissionModuleKey,
} from "@/lib/permission-modules";

/** Fresh DB read of what an admin can do right now — never derived from the
 * JWT, so a permission change takes effect on the user's very next action
 * instead of only after they log back in. Returns "full" for admins whose
 * role bypasses the permission list entirely. */
export async function getEffectivePermissions(
  adminId: string,
): Promise<Set<PermissionKey> | "full"> {
  const admin = await prisma.admin.findUnique({
    where: { id: adminId },
    select: {
      isActive: true,
      role: {
        select: {
          isFullAccess: true,
          permissions: { select: { permission: true } },
        },
      },
    },
  });
  if (!admin || !admin.isActive) return new Set();
  if (admin.role.isFullAccess) return "full";
  return new Set(admin.role.permissions.map((p) => p.permission));
}

/** For Server Components deciding what to render (nav items, whole pages). */
export async function hasPermission(permission: PermissionKey): Promise<boolean> {
  const session = await auth();
  if (!session?.user) return false;
  const effective = await getEffectivePermissions(session.user.id);
  return effective === "full" || effective.has(permission);
}

/** Gate for a whole Server Component page — call as the first line before
 * any data fetching. Sends an authenticated-but-forbidden user to a
 * dedicated page with a clear "you don't have access" message instead of
 * a generic not-found page, so it's obvious this is a permissions issue
 * and not a broken link. The layout above already redirects unauthenticated
 * visitors to /login, so by the time a page body runs the only remaining
 * case here is "authenticated but not permitted". */
export async function requirePageAccess(permission: PermissionKey): Promise<void> {
  const allowed = await hasPermission(permission);
  if (!allowed) redirect("/dashboard/access-denied");
}

export type PermissionCheck =
  | { ok: true; adminId: string }
  | { ok: false; status: 401 | 403; error: string };

/** Call at the top of every gated server action — this is the actual
 * enforcement point, the frontend hiding a button is not a substitute.
 * Returns a discriminated union on `ok` so `if (!access.ok) return
 * { error: access.error }` narrows `access.adminId` to `string` for the
 * rest of the function. `status` mirrors the HTTP semantics this check
 * would carry (401 unauthenticated / 403 authenticated-but-forbidden) for
 * anything that can act on it, e.g. requireApiPermission below. */
export async function requirePermission(
  permission: PermissionKey,
): Promise<PermissionCheck> {
  const session = await auth();
  if (!session?.user) {
    return { ok: false, status: 401, error: "يجب تسجيل الدخول أولاً" };
  }

  const effective = await getEffectivePermissions(session.user.id);
  if (effective !== "full" && !effective.has(permission)) {
    return {
      ok: false,
      status: 403,
      error: "ليست لديك الصلاحية الكافية لتنفيذ هذا الإجراء",
    };
  }
  return { ok: true, adminId: session.user.id };
}

/** Same check as requirePermission, for real Route Handlers (src/app/api/**)
 * instead of Server Actions — returns an actual NextResponse with a 401 or
 * 403 status, since those are real HTTP boundaries where a status code is
 * meaningful (unlike a Server Action's return value). */
export async function requireApiPermission(
  permission: PermissionKey,
): Promise<{ ok: true; adminId: string } | { ok: false; response: NextResponse }> {
  const access = await requirePermission(permission);
  if (access.ok) return access;
  return {
    ok: false,
    response: NextResponse.json({ error: access.error }, { status: access.status }),
  };
}

/** How many *other* active, full-access admins exist besides `excludeAdminId`.
 * Used to block the last remaining admin from being deactivated, deleted, or
 * demoted — whether that's happening to themselves or to someone else. */
export async function countOtherActiveFullAccessAdmins(
  excludeAdminId: string,
): Promise<number> {
  return prisma.admin.count({
    where: {
      id: { not: excludeAdminId },
      isActive: true,
      role: { isFullAccess: true },
    },
  });
}

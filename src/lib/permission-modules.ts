// No "server-only" here on purpose: this file is pure constants and string
// helpers with no DB/auth dependency, so both server code (src/lib/permissions.ts)
// and client components (the role permission-matrix UI) can import it directly.
import { PermissionKey } from "@/generated/prisma/enums";

export { PermissionKey };

/** The app's feature modules, each carrying a VIEW and a MANAGE permission.
 * Kept in sync by hand with the PermissionKey enum in schema.prisma — see
 * the enum there for the full list (it also has USERS_MANAGE and
 * SETTINGS_MANAGE, which aren't modules and so aren't listed here). */
export const PERMISSION_MODULE_KEYS = [
  "PRODUCTS",
  "ORDERS",
  "CUSTOMERS",
  "INVENTORY",
  "PURCHASES",
  "INVOICES",
  "SUPPLIERS",
  "EXPENSES",
  "REPORTS",
  "RETURNS",
] as const;

export type PermissionModuleKey = (typeof PERMISSION_MODULE_KEYS)[number];

export function moduleViewPermission(module: PermissionModuleKey): PermissionKey {
  return `${module}_VIEW` as PermissionKey;
}

export function moduleManagePermission(module: PermissionModuleKey): PermissionKey {
  return `${module}_MANAGE` as PermissionKey;
}

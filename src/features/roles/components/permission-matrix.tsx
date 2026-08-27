"use client";

import { Checkbox } from "@/components/ui/checkbox";
import {
  PERMISSION_MODULE_KEYS,
  moduleViewPermission,
  moduleManagePermission,
  PermissionKey,
} from "@/lib/permission-modules";
import { useLocale } from "@/i18n/locale-provider";

export function PermissionMatrix({
  value,
  onChange,
  disabled,
}: {
  value: PermissionKey[];
  onChange: (next: PermissionKey[]) => void;
  disabled?: boolean;
}) {
  const { t } = useLocale();
  const selected = new Set(value);

  function toggle(permission: PermissionKey, checked: boolean) {
    const next = new Set(selected);
    if (checked) next.add(permission);
    else next.delete(permission);
    onChange(Array.from(next));
  }

  return (
    <div className="overflow-x-auto rounded-lg border">
      <table className="w-full text-sm">
        <thead className="bg-muted/50">
          <tr>
            <th className="p-2 text-start font-medium">{t.roles.moduleColumn}</th>
            <th className="p-2 text-center font-medium">{t.roles.viewColumn}</th>
            <th className="p-2 text-center font-medium">{t.roles.manageColumn}</th>
          </tr>
        </thead>
        <tbody>
          {PERMISSION_MODULE_KEYS.map((moduleKey) => {
            const viewPermission = moduleViewPermission(moduleKey);
            const managePermission = moduleManagePermission(moduleKey);
            const moduleLabel = t.roles.modules[moduleKey];
            return (
              <tr key={moduleKey} className="border-t">
                <td className="p-2">{moduleLabel}</td>
                <td className="p-2 text-center">
                  <Checkbox
                    disabled={disabled}
                    checked={selected.has(viewPermission)}
                    onCheckedChange={(checked) => toggle(viewPermission, checked)}
                    aria-label={`${moduleLabel} — ${t.roles.viewColumn}`}
                  />
                </td>
                <td className="p-2 text-center">
                  <Checkbox
                    disabled={disabled}
                    checked={selected.has(managePermission)}
                    onCheckedChange={(checked) => toggle(managePermission, checked)}
                    aria-label={`${moduleLabel} — ${t.roles.manageColumn}`}
                  />
                </td>
              </tr>
            );
          })}
          <tr className="border-t bg-muted/30">
            <td className="p-2 font-medium">{t.roles.usersManagePermission}</td>
            <td className="p-2 text-center text-muted-foreground">—</td>
            <td className="p-2 text-center">
              <Checkbox
                disabled={disabled}
                checked={selected.has("USERS_MANAGE")}
                onCheckedChange={(checked) => toggle("USERS_MANAGE", checked)}
                aria-label={t.roles.usersManagePermission}
              />
            </td>
          </tr>
          <tr className="border-t bg-muted/30">
            <td className="p-2 font-medium">{t.roles.settingsManagePermission}</td>
            <td className="p-2 text-center text-muted-foreground">—</td>
            <td className="p-2 text-center">
              <Checkbox
                disabled={disabled}
                checked={selected.has("SETTINGS_MANAGE")}
                onCheckedChange={(checked) => toggle("SETTINGS_MANAGE", checked)}
                aria-label={t.roles.settingsManagePermission}
              />
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

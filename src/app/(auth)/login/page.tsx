import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { LoginForm } from "@/features/auth/components/login-form";
import { LocaleSwitcher } from "@/components/shared/locale-switcher";
import { getDictionary } from "@/i18n/server";

export default async function LoginPage() {
  const t = await getDictionary();

  return (
    <main className="flex min-h-screen items-center justify-center bg-muted/40 p-4">
      <div className="w-full max-w-sm space-y-3">
        <div className="flex justify-end">
          <LocaleSwitcher />
        </div>
        <Card>
          <CardHeader>
            <CardTitle>{t.auth.loginTitle}</CardTitle>
            <CardDescription>{t.auth.loginDescription}</CardDescription>
          </CardHeader>
          <CardContent>
            <LoginForm />
          </CardContent>
        </Card>
      </div>
    </main>
  );
}

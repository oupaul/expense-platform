import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { ApiError } from "@/lib/api";

interface Props {
  onLogin: (companySlug: string, email: string, password: string) => Promise<unknown>;
}

export function LoginForm({ onLogin }: Props) {
  const [companySlug, setCompanySlug] = useState("demo-b");
  const [email, setEmail] = useState("applicant@demo-b.test");
  const [password, setPassword] = useState("REDACTED_DEMO_PASSWORD");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await onLogin(companySlug, email, password);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "登入失敗");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-100">
      <form onSubmit={handleSubmit} className="w-80 space-y-4 rounded-lg bg-white p-8 shadow">
        <h1 className="text-lg font-bold">費用申請系統登入</h1>
        <div>
          <Label>公司代號</Label>
          <Input value={companySlug} onChange={(e) => setCompanySlug(e.target.value)} placeholder="例如 demo-b" />
        </div>
        <div>
          <Label>Email</Label>
          <Input value={email} onChange={(e) => setEmail(e.target.value)} type="email" />
        </div>
        <div>
          <Label>密碼</Label>
          <Input value={password} onChange={(e) => setPassword(e.target.value)} type="password" />
        </div>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <Button type="submit" className="w-full" disabled={submitting}>
          {submitting ? "登入中…" : "登入"}
        </Button>
        <p className="text-xs text-muted-foreground">
          示範帳號：admin / applicant / dept_manager / finance / ceo(或 gm)@demo-b.test 或 @demo-a.test，密碼皆為 REDACTED_DEMO_PASSWORD
        </p>
      </form>
    </div>
  );
}

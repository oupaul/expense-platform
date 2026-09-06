import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { ApiError } from "@/lib/api";

interface Props {
  onLogin: (companySlug: string, email: string, password: string) => Promise<unknown>;
}

// 預填示範帳號、底下的提示文字都只在本機開發(`npm run dev`)有意義——那是唯一能保證
// 真的跑過 `npm run seed`、示範資料確實存在的情境。這支元件被同一份建置產物(`vite build`)
// 用在任何部署上，不管是特地灌了示範資料的展示站、還是客戶完全沒選示範資料的正式站，
// 寫死在這裡的話兩種情境都會秀出來，正式站沒有這些帳號會讓人以為是空白畫面壞掉。
const SHOW_DEMO_HINT = import.meta.env.DEV;

export function LoginForm({ onLogin }: Props) {
  const [companySlug, setCompanySlug] = useState(SHOW_DEMO_HINT ? "demo-a" : "");
  const [email, setEmail] = useState(SHOW_DEMO_HINT ? "applicant@demo-a.test" : "");
  const [password, setPassword] = useState("");
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
          <Input value={companySlug} onChange={(e) => setCompanySlug(e.target.value)} placeholder="例如 acme" />
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
        {SHOW_DEMO_HINT && (
          <p className="text-xs text-muted-foreground">
            示範帳號：admin / applicant / dept_manager / finance / ceo(或 gm)@demo-a.test 或 @demo-b.test，
            密碼是執行 `npm run seed` 當下 console 印出來的那組隨機密碼(每次跑都不一樣)。
          </p>
        )}
      </form>
    </div>
  );
}

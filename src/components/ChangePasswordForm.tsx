import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { apiFetch, ApiError } from "@/lib/api";

interface Props {
  token: string;
  // 租戶使用者跟平台管理者的變更密碼端點不一樣，呼叫端各自傳自己的路徑，
  // 元件本身的表單/驗證邏輯完全共用。
  path?: string;
}

export function ChangePasswordForm({ token, path = "/auth/change-password" }: Props) {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [state, setState] = useState<{ status: "idle" | "submitting" | "success" | "error"; message?: string }>({
    status: "idle",
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword !== confirmPassword) {
      setState({ status: "error", message: "兩次輸入的新密碼不一致" });
      return;
    }
    setState({ status: "submitting" });
    try {
      await apiFetch(path, {
        method: "POST",
        token,
        body: { currentPassword, newPassword },
      });
      setState({ status: "success", message: "密碼已更新" });
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch (err) {
      setState({ status: "error", message: err instanceof ApiError ? err.message : "更新失敗" });
    }
  };

  return (
    <div className="mx-auto max-w-md space-y-4 rounded-lg border bg-white p-6">
      <h2 className="text-lg font-bold">修改密碼</h2>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <Label>目前密碼</Label>
          <Input type="password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} />
        </div>
        <div>
          <Label>新密碼(至少 8 碼)</Label>
          <Input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} />
        </div>
        <div>
          <Label>確認新密碼</Label>
          <Input type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} />
        </div>
        {state.status === "success" && <p className="text-sm text-green-600">{state.message}</p>}
        {state.status === "error" && <p className="text-sm text-destructive">{state.message}</p>}
        <Button type="submit" className="w-full" disabled={state.status === "submitting" || !currentPassword || newPassword.length < 8}>
          {state.status === "submitting" ? "更新中…" : "更新密碼"}
        </Button>
      </form>
    </div>
  );
}

import path from "node:path";
import fs from "node:fs";
import os from "node:os";
import { randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import cron, { type ScheduledTask } from "node-cron";
import { prisma } from "../db.js";
import { decryptSecret } from "../auth/nasSecret.js";

const execFileAsync = promisify(execFile);

// 執行時的 cwd 是 server/(systemd 的 WorkingDirectory)，backup.sh 期待的 APP_DIR
// 是 repo 根目錄(server/ 的上一層)，兩者要對齊，跟 attachments.ts 用 process.cwd()
// 當 UPLOAD_ROOT 基準是同一個道理。
const APP_DIR = process.env.APP_DIR ?? path.resolve(process.cwd(), "..");
export const BACKUP_DIR = process.env.BACKUP_DIR ?? "/srv/backups/expense-platform";
const BACKUP_SCRIPT = path.join(APP_DIR, "server", "scripts", "backup.sh");
const RUN_TIMEOUT_MS = 10 * 60 * 1000; // 備份(含 NAS 同步)最多跑 10 分鐘，避免卡死的行程一直佔著

let scheduledTask: ScheduledTask | null = null;

function truncate(text: string, max = 4000): string {
  return text.length > max ? `${text.slice(0, max)}\n…(截斷)` : text;
}

// 把 SSH 私鑰解密寫進一個只有自己讀寫得到的暫存檔案，用完一定要刪掉——
// 不管成功或失敗都要清，所以呼叫端要包在 try/finally 裡。
async function withTempKeyFile<T>(encryptedKey: string, fn: (keyPath: string) => Promise<T>): Promise<T> {
  const keyPath = path.join(os.tmpdir(), `nas-key-${randomUUID()}`);
  fs.writeFileSync(keyPath, decryptSecret(encryptedKey), { mode: 0o600 });
  try {
    return await fn(keyPath);
  } finally {
    fs.rm(keyPath, { force: true }, () => {});
  }
}

function escapeRemote(value: string): string {
  return `'${value.replace(/'/g, "'\\''")}'`;
}

interface NasConfig {
  nasHost: string;
  nasPort: number;
  nasUsername: string;
  nasRemotePath: string;
  nasPrivateKeyEnc: string;
}

// 測試 NAS 連線：SSH 進去、確認目標路徑存在(不存在就建立)且可寫，不用真的跑一次完整備份
// 才知道設定有沒有打錯字——這個回饋要快，設定表單填錯 host/路徑是很常見的失誤。
export async function testNasConnection(config: NasConfig): Promise<{ ok: boolean; message: string }> {
  try {
    await withTempKeyFile(config.nasPrivateKeyEnc, async (keyPath) => {
      const remoteCmd = `mkdir -p ${escapeRemote(config.nasRemotePath)} && test -w ${escapeRemote(config.nasRemotePath)} && echo OK`;
      const { stdout } = await execFileAsync(
        "ssh",
        [
          "-i", keyPath,
          "-p", String(config.nasPort),
          "-o", "BatchMode=yes",
          "-o", "ConnectTimeout=10",
          "-o", "StrictHostKeyChecking=accept-new",
          `${config.nasUsername}@${config.nasHost}`,
          remoteCmd,
        ],
        { timeout: 20_000 }
      );
      if (!stdout.includes("OK")) throw new Error("連線成功但無法確認目標路徑可寫入");
    });
    return { ok: true, message: "連線成功，目標路徑可寫入" };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : "連線失敗" };
  }
}

// 實際執行一次備份：先跑 backup.sh 做本機備份，成功才做 NAS 同步(rsync --delete 鏡像，
// 本機保留幾天 NAS 就跟著保留幾天，不用兩邊分別管理保留邏輯)。結果寫回 BackupConfig
// 讓後台可以顯示「上次備份：成功/失敗，時間、訊息」。
export async function runBackupNow(): Promise<{ ok: boolean; message: string }> {
  const config = await prisma.backupConfig.findUnique({ where: { id: "singleton" } });
  const retentionDays = config?.retentionDays ?? 14;

  let message = "";
  let ok = true;
  try {
    const { stdout } = await execFileAsync(
      "bash",
      [BACKUP_SCRIPT],
      {
        env: { ...process.env, APP_DIR, BACKUP_DIR, KEEP_DAYS: String(retentionDays) },
        timeout: RUN_TIMEOUT_MS,
      }
    );
    message = `本機備份成功\n${stdout}`;

    if (config?.nasEnabled && config.nasHost && config.nasUsername && config.nasRemotePath && config.nasPrivateKeyEnc) {
      await withTempKeyFile(config.nasPrivateKeyEnc, async (keyPath) => {
        const sshCommand = `ssh -i ${keyPath} -p ${config.nasPort} -o StrictHostKeyChecking=accept-new`;
        const { stdout: rsyncOut } = await execFileAsync(
          "rsync",
          ["-avz", "--delete", "-e", sshCommand, `${BACKUP_DIR}/`, `${config.nasUsername}@${config.nasHost}:${config.nasRemotePath}/`],
          { timeout: RUN_TIMEOUT_MS }
        );
        message += `\n\nNAS 同步成功\n${rsyncOut}`;
      });
    }
  } catch (err) {
    ok = false;
    message = err instanceof Error ? err.message : "備份失敗";
  }

  await prisma.backupConfig.upsert({
    where: { id: "singleton" },
    update: { lastRunAt: new Date(), lastRunStatus: ok ? "success" : "failed", lastRunMessage: truncate(message) },
    create: {
      id: "singleton",
      lastRunAt: new Date(),
      lastRunStatus: ok ? "success" : "failed",
      lastRunMessage: truncate(message),
    },
  });

  return { ok, message };
}

// 依目前資料庫裡的設定(重新)套用排程；設定被平台管理者改過之後要呼叫這個，
// 讓新的排程立刻生效，不用重啟服務。
export async function rescheduleBackupJob(): Promise<void> {
  if (scheduledTask) {
    scheduledTask.stop();
    scheduledTask = null;
  }

  const config = await prisma.backupConfig.findUnique({ where: { id: "singleton" } });
  if (!config?.enabled) return;
  if (!cron.validate(config.cronExpression)) {
    console.error(`備份排程的 cron 表達式無效，略過排程：${config.cronExpression}`);
    return;
  }

  scheduledTask = cron.schedule(config.cronExpression, () => {
    runBackupNow().catch((err) => console.error("排程備份執行失敗", err));
  });
}

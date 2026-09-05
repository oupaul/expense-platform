import { randomBytes } from "crypto";
import { PrismaClient } from "@prisma/client";
import { hashPassword } from "../src/auth/password.js";

const prisma = new PrismaClient();

// 平台管理者是服務供應商自己的帳號，刻意不寫死 email/姓名進 repo(這是公開專案)，
// 一律從環境變數帶進來；用 upsert 讓這支腳本可以重複執行也不會出錯或重複建立。
async function main() {
  const email = process.env.PLATFORM_ADMIN_EMAIL;
  const name = process.env.PLATFORM_ADMIN_NAME ?? "平台管理者";
  if (!email) {
    console.error("請設定 PLATFORM_ADMIN_EMAIL 環境變數後再執行，例如：");
    console.error("  PLATFORM_ADMIN_EMAIL=you@example.com npm run seed:platform-admin");
    process.exit(1);
  }

  const existing = await prisma.platformAdmin.findUnique({ where: { email } });
  if (existing) {
    console.log(`平台管理者帳號已存在：${existing.email}，不會變更密碼。`);
    console.log("要改密碼請登入後用「修改密碼」功能，不要重跑這支腳本。");
    return;
  }

  const password = randomBytes(9).toString("base64url");
  const passwordHash = await hashPassword(password);
  const admin = await prisma.platformAdmin.create({ data: { email, name, passwordHash } });

  console.log(`已建立平台管理者帳號：${admin.email}`);
  console.log(`密碼：${password}`);
  console.log("這組密碼只在這次執行印出來，沒有存在任何檔案裡，請自行記下來或登入後立刻改掉。");
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

import { readFileSync, readdirSync } from "fs";
import { fileURLToPath } from "url";
import path from "path";
import { randomBytes } from "crypto";
import { PrismaClient } from "@prisma/client";
import { hashPassword } from "../src/auth/password.js";

const prisma = new PrismaClient();
const seedDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "seed-examples");

// 不要寫死示範密碼 —— 這份 repo 是公開的，寫死的密碼等於公開的後門。
// 每次跑 seed 都隨機生成一組，只印在當次執行的 console 輸出裡。
const DEMO_PASSWORD = randomBytes(9).toString("base64url");

const ROLE_LABELS: Record<string, string> = {
  admin: "後台管理員",
  applicant: "一般申請人",
  dept_manager: "部門主管",
  finance: "財務審核",
  gm: "總經理",
  ceo: "執行長",
};

interface SeedFile {
  company: {
    name: string;
    nameEn?: string;
    primaryColor: string;
    headerBgColor: string;
    gradientFrom: string;
    gradientTo: string;
    multiCurrencyEnabled: boolean;
    optionalFields: Record<string, boolean>;
  };
  departments: string[];
  expenseNatures: string[];
  expenseCategories: string[];
  approvalStages: { roleKey: string; label: string }[];
}

async function seedCompany(slug: string, data: SeedFile) {
  const company = await prisma.company.upsert({
    where: { slug },
    update: {
      name: data.company.name,
      nameEn: data.company.nameEn,
      primaryColor: data.company.primaryColor,
      headerBgColor: data.company.headerBgColor,
      gradientFrom: data.company.gradientFrom,
      gradientTo: data.company.gradientTo,
      multiCurrencyEnabled: data.company.multiCurrencyEnabled,
      optionalFields: data.company.optionalFields,
    },
    create: {
      slug,
      name: data.company.name,
      nameEn: data.company.nameEn,
      primaryColor: data.company.primaryColor,
      headerBgColor: data.company.headerBgColor,
      gradientFrom: data.company.gradientFrom,
      gradientTo: data.company.gradientTo,
      multiCurrencyEnabled: data.company.multiCurrencyEnabled,
      optionalFields: data.company.optionalFields,
    },
  });

  // 種子資料重跑要冪等：先清掉舊的選項/關卡再重新建立
  await prisma.department.deleteMany({ where: { companyId: company.id } });
  await prisma.expenseCategory.deleteMany({ where: { companyId: company.id } });
  await prisma.expenseNature.deleteMany({ where: { companyId: company.id } });
  await prisma.approvalStage.deleteMany({ where: { companyId: company.id } });

  await prisma.department.createMany({
    data: data.departments.map((name, i) => ({ companyId: company.id, name, sortOrder: i })),
  });
  await prisma.expenseCategory.createMany({
    data: data.expenseCategories.map((name, i) => ({ companyId: company.id, name, sortOrder: i })),
  });
  await prisma.expenseNature.createMany({
    data: data.expenseNatures.map((name, i) => ({ companyId: company.id, name, sortOrder: i })),
  });
  await prisma.approvalStage.createMany({
    data: data.approvalStages.map((s, i) => ({
      companyId: company.id,
      stageOrder: i,
      roleKey: s.roleKey,
      label: s.label,
    })),
  });

  const firstDepartment = await prisma.department.findFirst({
    where: { companyId: company.id },
    orderBy: { sortOrder: "asc" },
  });

  const roles = new Set(["admin", "applicant", ...data.approvalStages.map((s) => s.roleKey)]);
  const passwordHash = await hashPassword(DEMO_PASSWORD);
  for (const role of roles) {
    const email = `${role}@${slug}.test`;
    await prisma.user.upsert({
      where: { companyId_email: { companyId: company.id, email } },
      update: { passwordHash, role, name: ROLE_LABELS[role] ?? role },
      create: {
        companyId: company.id,
        email,
        passwordHash,
        role,
        name: ROLE_LABELS[role] ?? role,
        departmentId: role === "applicant" ? firstDepartment?.id : undefined,
      },
    });
  }

  console.log(`已建立公司設定：${slug}(${data.company.name})`);
}

async function main() {
  const files = readdirSync(seedDir).filter((f) => f.endsWith(".json"));
  for (const file of files) {
    const slug = path.basename(file, ".json");
    const data = JSON.parse(readFileSync(path.join(seedDir, file), "utf-8")) as SeedFile;
    await seedCompany(slug, data);
  }
  console.log(`\n所有示範帳號(admin / applicant / 各簽核角色 @<slug>.test)這次的密碼都是：${DEMO_PASSWORD}`);
  console.log("這組密碼只在這次執行印出來，沒有存在任何檔案裡，請自行記下來或直接重設。");
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

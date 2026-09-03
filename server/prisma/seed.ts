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

  // 種子資料要能重跑且不能是破壞性的：一旦這家公司已經有真的申請單在用這些部門/類別，
  // deleteMany 整批砍掉重建就會撞到外鍵擋下來（甚至更糟，如果 FK 允許串聯刪除，
  // 會直接把已送出的申請單資料也一起弄丟）。改成 upsert，只新增缺的、更新既有的，
  // 絕對不刪除任何一列。
  for (const [i, name] of data.departments.entries()) {
    await prisma.department.upsert({
      where: { companyId_name: { companyId: company.id, name } },
      update: { sortOrder: i },
      create: { companyId: company.id, name, sortOrder: i },
    });
  }
  for (const [i, name] of data.expenseCategories.entries()) {
    await prisma.expenseCategory.upsert({
      where: { companyId_name: { companyId: company.id, name } },
      update: { sortOrder: i },
      create: { companyId: company.id, name, sortOrder: i },
    });
  }
  for (const [i, name] of data.expenseNatures.entries()) {
    await prisma.expenseNature.upsert({
      where: { companyId_name: { companyId: company.id, name } },
      update: { sortOrder: i },
      create: { companyId: company.id, name, sortOrder: i },
    });
  }
  for (const [i, stage] of data.approvalStages.entries()) {
    await prisma.approvalStage.upsert({
      where: { companyId_stageOrder: { companyId: company.id, stageOrder: i } },
      update: { roleKey: stage.roleKey, label: stage.label },
      create: { companyId: company.id, stageOrder: i, roleKey: stage.roleKey, label: stage.label },
    });
  }

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

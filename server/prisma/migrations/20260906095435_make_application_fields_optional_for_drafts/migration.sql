-- DropForeignKey
ALTER TABLE "ExpenseApplication" DROP CONSTRAINT "ExpenseApplication_departmentId_fkey";

-- DropForeignKey
ALTER TABLE "ExpenseApplication" DROP CONSTRAINT "ExpenseApplication_expenseNatureId_fkey";

-- AlterTable
ALTER TABLE "ExpenseApplication" ALTER COLUMN "departmentId" DROP NOT NULL,
ALTER COLUMN "expenseNatureId" DROP NOT NULL,
ALTER COLUMN "applicationDate" DROP NOT NULL;

-- AddForeignKey
ALTER TABLE "ExpenseApplication" ADD CONSTRAINT "ExpenseApplication_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExpenseApplication" ADD CONSTRAINT "ExpenseApplication_expenseNatureId_fkey" FOREIGN KEY ("expenseNatureId") REFERENCES "ExpenseNature"("id") ON DELETE SET NULL ON UPDATE CASCADE;

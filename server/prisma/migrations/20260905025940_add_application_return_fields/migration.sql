-- AlterTable
ALTER TABLE "ExpenseApplication" ADD COLUMN     "returnComment" TEXT,
ADD COLUMN     "returnedAt" TIMESTAMP(3),
ADD COLUMN     "returnedByStageLabel" TEXT;

-- AlterTable
ALTER TABLE "Notification" ADD COLUMN     "emailError" TEXT,
ADD COLUMN     "emailStatus" TEXT NOT NULL DEFAULT 'skipped';

-- CreateIndex
CREATE INDEX "Notification_companyId_emailStatus_idx" ON "Notification"("companyId", "emailStatus");

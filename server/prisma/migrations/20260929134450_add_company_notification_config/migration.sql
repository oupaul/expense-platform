-- AlterTable
ALTER TABLE "Company" ADD COLUMN     "notifyAuthMethod" TEXT,
ADD COLUMN     "notifyM365ClientId" TEXT,
ADD COLUMN     "notifyM365ClientSecretEnc" TEXT,
ADD COLUMN     "notifyM365FromAddress" TEXT,
ADD COLUMN     "notifyM365TenantId" TEXT,
ADD COLUMN     "notifySmtpAllowSelfSigned" BOOLEAN,
ADD COLUMN     "notifySmtpFrom" TEXT,
ADD COLUMN     "notifySmtpHost" TEXT,
ADD COLUMN     "notifySmtpPassEnc" TEXT,
ADD COLUMN     "notifySmtpPort" INTEGER,
ADD COLUMN     "notifySmtpSecure" BOOLEAN,
ADD COLUMN     "notifySmtpUser" TEXT;

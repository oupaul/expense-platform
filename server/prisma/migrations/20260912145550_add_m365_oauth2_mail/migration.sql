-- AlterTable
ALTER TABLE "NotificationConfig" ADD COLUMN     "authMethod" TEXT NOT NULL DEFAULT 'smtp',
ADD COLUMN     "m365ClientId" TEXT,
ADD COLUMN     "m365ClientSecretEnc" TEXT,
ADD COLUMN     "m365FromAddress" TEXT,
ADD COLUMN     "m365TenantId" TEXT;

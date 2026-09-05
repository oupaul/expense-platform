-- CreateTable
CREATE TABLE "BackupConfig" (
    "id" TEXT NOT NULL DEFAULT 'singleton',
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "cronExpression" TEXT NOT NULL DEFAULT '0 3 * * *',
    "retentionDays" INTEGER NOT NULL DEFAULT 14,
    "nasEnabled" BOOLEAN NOT NULL DEFAULT false,
    "nasHost" TEXT,
    "nasPort" INTEGER NOT NULL DEFAULT 22,
    "nasUsername" TEXT,
    "nasRemotePath" TEXT,
    "nasPrivateKeyEnc" TEXT,
    "lastRunAt" TIMESTAMP(3),
    "lastRunStatus" TEXT,
    "lastRunMessage" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BackupConfig_pkey" PRIMARY KEY ("id")
);

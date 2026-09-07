-- AlterTable
ALTER TABLE "Company" ADD COLUMN     "appNumberDateFormat" TEXT NOT NULL DEFAULT 'none',
ADD COLUMN     "appNumberEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "appNumberPrefix" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "appNumberResetPeriod" TEXT NOT NULL DEFAULT 'daily',
ADD COLUMN     "appNumberSeqDigits" INTEGER NOT NULL DEFAULT 2;

-- AlterTable
ALTER TABLE "ExpenseApplication" ADD COLUMN     "applicationNumber" TEXT;

-- CreateTable
CREATE TABLE "ApplicationNumberCounter" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "periodKey" TEXT NOT NULL,
    "value" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "ApplicationNumberCounter_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ApplicationNumberCounter_companyId_periodKey_key" ON "ApplicationNumberCounter"("companyId", "periodKey");

-- CreateIndex
CREATE UNIQUE INDEX "ExpenseApplication_companyId_applicationNumber_key" ON "ExpenseApplication"("companyId", "applicationNumber");

-- AddForeignKey
ALTER TABLE "ApplicationNumberCounter" ADD CONSTRAINT "ApplicationNumberCounter_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

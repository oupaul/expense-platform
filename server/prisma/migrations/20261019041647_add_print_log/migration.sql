-- CreateTable
CREATE TABLE "PrintLog" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "applicationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PrintLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PrintLog_applicationId_createdAt_idx" ON "PrintLog"("applicationId", "createdAt");

-- CreateIndex
CREATE INDEX "PrintLog_companyId_idx" ON "PrintLog"("companyId");

-- AddForeignKey
ALTER TABLE "PrintLog" ADD CONSTRAINT "PrintLog_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PrintLog" ADD CONSTRAINT "PrintLog_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "ExpenseApplication"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PrintLog" ADD CONSTRAINT "PrintLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

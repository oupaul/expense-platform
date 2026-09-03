-- CreateTable
CREATE TABLE "Company" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "nameEn" TEXT,
    "logoUrl" TEXT,
    "primaryColor" TEXT NOT NULL DEFAULT '#3498db',
    "headerBgColor" TEXT NOT NULL DEFAULT '#2c3e50',
    "gradientFrom" TEXT NOT NULL DEFAULT '#667eea',
    "gradientTo" TEXT NOT NULL DEFAULT '#764ba2',
    "multiCurrencyEnabled" BOOLEAN NOT NULL DEFAULT false,
    "optionalFields" JSONB NOT NULL DEFAULT '{"projectCode":false,"invoiceDate":false,"payeeInfo":false,"requestedPaymentDate":false}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Company_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Department" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "Department_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExpenseCategory" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "ExpenseCategory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExpenseNature" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "ExpenseNature_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ApprovalStage" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "stageOrder" INTEGER NOT NULL,
    "roleKey" TEXT NOT NULL,
    "label" TEXT NOT NULL,

    CONSTRAINT "ApprovalStage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "departmentId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExpenseApplication" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "applicantId" TEXT NOT NULL,
    "departmentId" TEXT NOT NULL,
    "expenseNatureId" TEXT NOT NULL,
    "applicationDate" TIMESTAMP(3) NOT NULL,
    "purpose" TEXT,
    "payeeName" TEXT,
    "payeeBankInfo" JSONB,
    "requestedPaymentDate" TIMESTAMP(3),
    "totalAmountTWD" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ExpenseApplication_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExpenseItem" (
    "id" TEXT NOT NULL,
    "applicationId" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "description" TEXT,
    "date" TIMESTAMP(3),
    "projectCode" TEXT,
    "invoiceDate" TIMESTAMP(3),
    "currency" TEXT NOT NULL DEFAULT 'TWD',
    "amount" DECIMAL(12,2) NOT NULL,
    "amountInTWD" DECIMAL(12,2) NOT NULL,

    CONSTRAINT "ExpenseItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ApprovalRecord" (
    "id" TEXT NOT NULL,
    "applicationId" TEXT NOT NULL,
    "stageId" TEXT NOT NULL,
    "approverId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'waiting',
    "comment" TEXT,
    "signedAt" TIMESTAMP(3),

    CONSTRAINT "ApprovalRecord_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Company_slug_key" ON "Company"("slug");

-- CreateIndex
CREATE INDEX "Department_companyId_active_idx" ON "Department"("companyId", "active");

-- CreateIndex
CREATE UNIQUE INDEX "Department_companyId_name_key" ON "Department"("companyId", "name");

-- CreateIndex
CREATE INDEX "ExpenseCategory_companyId_active_idx" ON "ExpenseCategory"("companyId", "active");

-- CreateIndex
CREATE UNIQUE INDEX "ExpenseCategory_companyId_name_key" ON "ExpenseCategory"("companyId", "name");

-- CreateIndex
CREATE INDEX "ExpenseNature_companyId_active_idx" ON "ExpenseNature"("companyId", "active");

-- CreateIndex
CREATE UNIQUE INDEX "ExpenseNature_companyId_name_key" ON "ExpenseNature"("companyId", "name");

-- CreateIndex
CREATE INDEX "ApprovalStage_companyId_idx" ON "ApprovalStage"("companyId");

-- CreateIndex
CREATE UNIQUE INDEX "ApprovalStage_companyId_stageOrder_key" ON "ApprovalStage"("companyId", "stageOrder");

-- CreateIndex
CREATE INDEX "User_companyId_role_idx" ON "User"("companyId", "role");

-- CreateIndex
CREATE UNIQUE INDEX "User_companyId_email_key" ON "User"("companyId", "email");

-- CreateIndex
CREATE INDEX "ExpenseApplication_companyId_status_idx" ON "ExpenseApplication"("companyId", "status");

-- CreateIndex
CREATE INDEX "ExpenseApplication_applicantId_idx" ON "ExpenseApplication"("applicantId");

-- CreateIndex
CREATE INDEX "ExpenseItem_applicationId_idx" ON "ExpenseItem"("applicationId");

-- CreateIndex
CREATE INDEX "ApprovalRecord_applicationId_idx" ON "ApprovalRecord"("applicationId");

-- CreateIndex
CREATE UNIQUE INDEX "ApprovalRecord_applicationId_stageId_key" ON "ApprovalRecord"("applicationId", "stageId");

-- AddForeignKey
ALTER TABLE "Department" ADD CONSTRAINT "Department_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExpenseCategory" ADD CONSTRAINT "ExpenseCategory_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExpenseNature" ADD CONSTRAINT "ExpenseNature_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApprovalStage" ADD CONSTRAINT "ApprovalStage_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExpenseApplication" ADD CONSTRAINT "ExpenseApplication_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExpenseApplication" ADD CONSTRAINT "ExpenseApplication_applicantId_fkey" FOREIGN KEY ("applicantId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExpenseApplication" ADD CONSTRAINT "ExpenseApplication_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExpenseApplication" ADD CONSTRAINT "ExpenseApplication_expenseNatureId_fkey" FOREIGN KEY ("expenseNatureId") REFERENCES "ExpenseNature"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExpenseItem" ADD CONSTRAINT "ExpenseItem_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "ExpenseApplication"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExpenseItem" ADD CONSTRAINT "ExpenseItem_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "ExpenseCategory"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApprovalRecord" ADD CONSTRAINT "ApprovalRecord_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "ExpenseApplication"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApprovalRecord" ADD CONSTRAINT "ApprovalRecord_stageId_fkey" FOREIGN KEY ("stageId") REFERENCES "ApprovalStage"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApprovalRecord" ADD CONSTRAINT "ApprovalRecord_approverId_fkey" FOREIGN KEY ("approverId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

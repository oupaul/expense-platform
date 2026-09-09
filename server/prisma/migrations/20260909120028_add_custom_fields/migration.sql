-- AlterTable
ALTER TABLE "ExpenseItem" ADD COLUMN     "customFieldValues" JSONB;

-- CreateTable
CREATE TABLE "CustomField" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "fieldType" TEXT NOT NULL DEFAULT 'text',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "CustomField_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CustomFieldOption" (
    "id" TEXT NOT NULL,
    "customFieldId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "CustomFieldOption_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExpenseCategoryCustomField" (
    "id" TEXT NOT NULL,
    "expenseCategoryId" TEXT NOT NULL,
    "customFieldId" TEXT NOT NULL,
    "required" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "ExpenseCategoryCustomField_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CustomField_companyId_active_idx" ON "CustomField"("companyId", "active");

-- CreateIndex
CREATE UNIQUE INDEX "CustomField_companyId_name_key" ON "CustomField"("companyId", "name");

-- CreateIndex
CREATE INDEX "CustomFieldOption_customFieldId_active_idx" ON "CustomFieldOption"("customFieldId", "active");

-- CreateIndex
CREATE UNIQUE INDEX "CustomFieldOption_customFieldId_label_key" ON "CustomFieldOption"("customFieldId", "label");

-- CreateIndex
CREATE UNIQUE INDEX "ExpenseCategoryCustomField_expenseCategoryId_customFieldId_key" ON "ExpenseCategoryCustomField"("expenseCategoryId", "customFieldId");

-- AddForeignKey
ALTER TABLE "CustomField" ADD CONSTRAINT "CustomField_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomFieldOption" ADD CONSTRAINT "CustomFieldOption_customFieldId_fkey" FOREIGN KEY ("customFieldId") REFERENCES "CustomField"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExpenseCategoryCustomField" ADD CONSTRAINT "ExpenseCategoryCustomField_expenseCategoryId_fkey" FOREIGN KEY ("expenseCategoryId") REFERENCES "ExpenseCategory"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExpenseCategoryCustomField" ADD CONSTRAINT "ExpenseCategoryCustomField_customFieldId_fkey" FOREIGN KEY ("customFieldId") REFERENCES "CustomField"("id") ON DELETE CASCADE ON UPDATE CASCADE;

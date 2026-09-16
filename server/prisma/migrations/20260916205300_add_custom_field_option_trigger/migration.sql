-- CreateTable
CREATE TABLE "CustomFieldOptionTrigger" (
    "id" TEXT NOT NULL,
    "customFieldOptionId" TEXT NOT NULL,
    "customFieldId" TEXT NOT NULL,
    "required" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "CustomFieldOptionTrigger_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CustomFieldOptionTrigger_customFieldOptionId_customFieldId_key" ON "CustomFieldOptionTrigger"("customFieldOptionId", "customFieldId");

-- AddForeignKey
ALTER TABLE "CustomFieldOptionTrigger" ADD CONSTRAINT "CustomFieldOptionTrigger_customFieldOptionId_fkey" FOREIGN KEY ("customFieldOptionId") REFERENCES "CustomFieldOption"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomFieldOptionTrigger" ADD CONSTRAINT "CustomFieldOptionTrigger_customFieldId_fkey" FOREIGN KEY ("customFieldId") REFERENCES "CustomField"("id") ON DELETE CASCADE ON UPDATE CASCADE;

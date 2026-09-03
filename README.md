# Expense Platform — 多租戶費用申請系統(設計階段)

延伸自 [trip-expense-form](../trip-expense-form) 的元件架構，比對 [已移除的網域] 與
[已移除的網域] 兩個既有客戶版型後，把「會因公司而異」的部分抽成資料庫設定，
同一套前端元件可以長出不同公司的表單。

## 目錄結構

```
prisma/schema.prisma        資料庫 schema(PostgreSQL)
prisma/seed-examples/       兩份範例設定，證明同一 schema 能還原兩個既有客戶站的樣子
  demo-a.json               對應 [已移除的網域] 現況
  demo-b.json                對應 [已移除的網域] 現況
src/types/company-config.ts  前後端共用的設定型別
src/hooks/useCompanyConfig.ts 抓公司設定的 React Query hook
src/components/
  BrandingProvider.tsx        把品牌色寫進 CSS variable
  DynamicExpenseForm.tsx      依設定動態渲染的表單本體
  ApprovalChain.tsx           依 approvalStages 陣列動態渲染簽核欄
```

## 設計重點

- **品牌與結構開關(Company 表)**：公司名稱、配色、`optionalFields`(專案編號/發票日期/
  受款人資訊/需求付款日 各自獨立開關)、`multiCurrencyEnabled`。這些改一次就很少再動，
  用 JSON 欄位存在 Company 上即可，不需要獨立 CRUD 畫面。
- **後台可維護的選項資料(Department / ExpenseCategory / ExpenseNature)**：各自獨立成表，
  有 `sortOrder` 和 `active`，對應「後台新增/編輯/刪除下拉選單資料」的需求，前台永遠只吃
  API 回傳的清單，不會有任何選項寫死在程式碼裡。
- **簽核關卡(ApprovalStage)**：用陣列表而非寫死 4 個欄位，示範公司A是 3 關(部門主管/財務/總經理)、
  示範公司B也是 3 關但最後一關叫「執行長核准」——兩者都能用同一份 schema、只是資料不同列。
- **多租戶隔離**：所有表都掛 `companyId`，API 層要確保每一次查詢都帶入目前登入者所屬的
  `companyId`，避免跨公司資料外洩。

## 尚未做的部分(下一步)

1. **後端 API**：`GET /api/companies/:id/config` 組合 Company + Departments + ExpenseNatures
   + ExpenseCategories + ApprovalStages 回傳給前端；以及申請單的建立/簽核 API。
2. **後台管理介面**：Departments / ExpenseCategories / ApprovalStages 的 CRUD 頁面(可以是同一個
   React app 底下的 `/admin` route，用角色權限保護)。
3. **認證/角色權限**：登入、JWT 或 session、依 `User.role` 控制看得到哪些申請單與簽核按鈕。
4. **實際串接 shadcn/ui 元件**：目前 `DynamicExpenseForm.tsx` 引用的 `@/components/ui/*` 沿用
   trip-expense-form 既有的元件，實際整合時直接複製那個專案的 `src/components/ui` 過來即可。
5. **部署**：確認 Ubuntu 主機是新開一台還是沿用現有的，再決定 PostgreSQL 要不要跟其他系統共用。

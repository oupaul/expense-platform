import type { Request, Response, NextFunction } from "express";
import { verifyAuthToken } from "../auth/jwt.js";

// 驗證 Bearer token，把解出來的身分資訊掛到 req.auth 供後面的 handler 使用。
export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    return res.status(401).json({ error: "未登入" });
  }
  try {
    req.auth = verifyAuthToken(header.slice("Bearer ".length));
    next();
  } catch {
    return res.status(401).json({ error: "登入已過期，請重新登入" });
  }
}

// 路由上有 :companyId 時，擋掉跨公司存取 —— 防止 A 公司的使用者用自己的 token 去查 B 公司的資料。
export function requireSameCompany(req: Request, res: Response, next: NextFunction) {
  if (req.auth?.companyId !== req.params.companyId) {
    return res.status(403).json({ error: "無權存取此公司的資料" });
  }
  next();
}

export function requireRole(...roles: string[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.auth || !roles.includes(req.auth.role)) {
      return res.status(403).json({ error: "權限不足" });
    }
    next();
  };
}

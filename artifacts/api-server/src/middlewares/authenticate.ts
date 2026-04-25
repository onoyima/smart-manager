import { type Request, type Response, type NextFunction } from "express";
import { verifyAccessToken } from "../lib/auth";

export interface AuthRequest extends Request {
  user?: { userId: string; email: string; plan: string };
}

export function authenticate(
  req: AuthRequest,
  res: Response,
  next: NextFunction,
): void {
  let token = "";
  const header = req.headers.authorization;
  
  if (header && header.startsWith("Bearer ")) {
    token = header.slice(7);
  } else if (req.query.token) {
    token = req.query.token as string;
  }

  if (!token) {
    res.status(401).json({ error: "Missing or invalid Authorization token" });
    return;
  }

  try {
    const payload = verifyAccessToken(token);
    req.user = { userId: payload.userId, email: payload.email, plan: payload.plan };
    next();
  } catch {
    res.status(401).json({ error: "Token expired or invalid" });
  }
}

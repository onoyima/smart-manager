import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";

const BCRYPT_ROUNDS = 12;

const JWT_SECRET = process.env.JWT_SECRET || "dev-secret-change-in-production";
const JWT_REFRESH_SECRET =
  process.env.JWT_REFRESH_SECRET || "dev-refresh-secret-change-in-production";

export const ACCESS_TOKEN_TTL = "15m";
export const REFRESH_TOKEN_TTL = "7d";
export const REFRESH_TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export interface AccessTokenPayload {
  userId: string;
  email: string;
  plan: string;
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, BCRYPT_ROUNDS);
}

export async function verifyPassword(
  password: string,
  hash: string,
): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export function signAccessToken(payload: AccessTokenPayload): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: ACCESS_TOKEN_TTL });
}

export function signRefreshToken(userId: string): string {
  return jwt.sign({ userId }, JWT_REFRESH_SECRET, {
    expiresIn: REFRESH_TOKEN_TTL,
  });
}

export function verifyAccessToken(token: string): AccessTokenPayload {
  return jwt.verify(token, JWT_SECRET) as AccessTokenPayload;
}

export function verifyRefreshToken(token: string): { userId: string } {
  return jwt.verify(token, JWT_REFRESH_SECRET) as { userId: string };
}

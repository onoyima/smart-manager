import { Router, type Request, type Response } from "express";
import { db } from "@workspace/db";
import { usersTable, refreshTokensTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { z } from "zod";
import {
  hashPassword,
  verifyPassword,
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken,
  REFRESH_TOKEN_TTL_MS,
} from "../lib/auth";
import { logger } from "../lib/logger";

const router = Router();

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8, "Password must be at least 8 characters"),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

// POST /auth/register
router.post("/auth/register", async (req: Request, res: Response) => {
  const parsed = registerSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid input", details: parsed.error.issues });
    return;
  }

  const { email, password } = parsed.data;

  const [existing] = await db
    .select({ id: usersTable.id })
    .from(usersTable)
    .where(eq(usersTable.email, email.toLowerCase()));

  if (existing) {
    res.status(409).json({ error: "Email already registered" });
    return;
  }

  const hashedPassword = await hashPassword(password);
  const [user] = await db
    .insert(usersTable)
    .values({ email: email.toLowerCase(), hashedPassword, plan: "free" })
    .$returningId();

  if (!user) {
    res.status(500).json({ error: "Failed to create user" });
    return;
  }

  const accessToken = signAccessToken({
    userId: user.id,
    email: email.toLowerCase(),
    plan: "free",
  });
  const refreshToken = signRefreshToken(user.id);

  await db.insert(refreshTokensTable).values({
    userId: user.id,
    token: refreshToken,
    expiresAt: new Date(Date.now() + REFRESH_TOKEN_TTL_MS),
  });

  res.cookie("refreshToken", refreshToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    maxAge: REFRESH_TOKEN_TTL_MS,
  });

  res.status(201).json({
    accessToken,
    user: { id: user.id, email: email.toLowerCase(), plan: "free" },
  });
});

// POST /auth/login
router.post("/auth/login", async (req: Request, res: Response) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid input" });
    return;
  }

  const { email, password } = parsed.data;

  const [user] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.email, email.toLowerCase()));

  if (!user) {
    res.status(401).json({ error: "Invalid email or password" });
    return;
  }

  const valid = await verifyPassword(password, user.hashedPassword);
  if (!valid) {
    res.status(401).json({ error: "Invalid email or password" });
    return;
  }

  const accessToken = signAccessToken({
    userId: user.id,
    email: user.email,
    plan: user.plan,
  });
  const refreshToken = signRefreshToken(user.id);

  await db.insert(refreshTokensTable).values({
    userId: user.id,
    token: refreshToken,
    expiresAt: new Date(Date.now() + REFRESH_TOKEN_TTL_MS),
  });

  res.cookie("refreshToken", refreshToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    maxAge: REFRESH_TOKEN_TTL_MS,
  });

  res.json({
    accessToken,
    user: { id: user.id, email: user.email, plan: user.plan },
  });
});

// POST /auth/refresh
router.post("/auth/refresh", async (req: Request, res: Response) => {
  const token = req.cookies?.refreshToken as string | undefined;
  if (!token) {
    res.status(401).json({ error: "No refresh token" });
    return;
  }

  let payload: { userId: string };
  try {
    payload = verifyRefreshToken(token);
  } catch {
    res.status(401).json({ error: "Refresh token expired or invalid" });
    return;
  }

  const [stored] = await db
    .select()
    .from(refreshTokensTable)
    .where(eq(refreshTokensTable.token, token));

  if (!stored || stored.expiresAt < new Date()) {
    res.status(401).json({ error: "Refresh token not found or expired" });
    return;
  }

  const [user] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.id, payload.userId));

  if (!user) {
    res.status(401).json({ error: "User not found" });
    return;
  }

  // Rotate refresh token
  await db
    .delete(refreshTokensTable)
    .where(eq(refreshTokensTable.token, token));

  const newRefreshToken = signRefreshToken(user.id);
  await db.insert(refreshTokensTable).values({
    userId: user.id,
    token: newRefreshToken,
    expiresAt: new Date(Date.now() + REFRESH_TOKEN_TTL_MS),
  });

  const accessToken = signAccessToken({
    userId: user.id,
    email: user.email,
    plan: user.plan,
  });

  res.cookie("refreshToken", newRefreshToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    maxAge: REFRESH_TOKEN_TTL_MS,
  });

  res.json({ accessToken, user: { id: user.id, email: user.email, plan: user.plan } });
});

// POST /auth/logout
router.post("/auth/logout", async (req: Request, res: Response) => {
  const token = req.cookies?.refreshToken as string | undefined;
  if (token) {
    await db
      .delete(refreshTokensTable)
      .where(eq(refreshTokensTable.token, token));
  }
  res.clearCookie("refreshToken");
  res.status(204).end();
});

export default router;

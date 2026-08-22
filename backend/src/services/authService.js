import jwt from "jsonwebtoken";
import User from "../models/User.js";

function normalizeEmail(email) {
  return email.trim().toLowerCase();
}

function getJwtSecret() {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error(
      "JWT_SECRET is not configured. Add it to backend/.env and restart the server."
    );
  }
  return secret;
}

export function authMiddleware(req, res, next) {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Authentication required" });
  }

  const token = header.slice(7);
  try {
    const payload = jwt.verify(token, getJwtSecret());
    req.user = { id: payload.id };
    next();
  } catch {
    return res.status(401).json({ error: "Invalid or expired token" });
  }
}

export function signToken(userId) {
  return jwt.sign({ id: userId }, getJwtSecret(), { expiresIn: "7d" });
}

export async function registerUser({ name, email, password }) {
  const normalizedEmail = normalizeEmail(email);
  const existing = await User.findOne({ email: normalizedEmail });
  if (existing) {
    throw new Error("Email already registered");
  }

  const user = await User.create({
    name: name.trim(),
    email: normalizedEmail,
    password,
  });
  const token = signToken(user._id);
  return {
    token,
    user: { id: user._id, name: user.name, email: user.email },
  };
}

export async function loginUser({ email, password }) {
  const normalizedEmail = normalizeEmail(email);
  const user = await User.findOne({ email: normalizedEmail }).select("+password");
  if (!user || !(await user.comparePassword(password))) {
    throw new Error("Invalid email or password");
  }

  const token = signToken(user._id);
  return {
    token,
    user: { id: user._id, name: user.name, email: user.email },
  };
}

export async function getUserById(id) {
  const user = await User.findById(id).lean();
  if (!user) return null;
  return { id: user._id, name: user.name, email: user.email };
}

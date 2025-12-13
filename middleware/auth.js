import jwt from "jsonwebtoken";

export function attachUser(req, _res, next) {
  const token = req.cookies?.token;
  if (!token) return next();
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    req.user = { id: payload.id, email: payload.email, displayName: payload.displayName };
  } catch {}
  next();
}

export function requireAuth(req, res, next) {
  if (!req.user) return res.status(401).send("Sign in required");
  next();
}

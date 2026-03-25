// src/controllers/auth.controller.ts

import { Request, Response, RequestHandler } from "express";
import bcrypt from "bcrypt";
import crypto from "crypto";
import { sequelize } from "../config/db";
import { signJwt, signRefreshToken, verifyRefreshToken } from "../lib/jwt";
import { setRefreshTokenCookie, clearRefreshTokenCookie, REFRESH_TOKEN_COOKIE } from "../lib/cookies";
import { User } from "../models/user.model";
import { VendedorPerfil } from "../models/VendedorPerfil";
import { sendResetPasswordEmail } from "../services/email.service";
import { runKYCAnalysis } from "../services/kyc.service";
import supabase from "../lib/supabase";
import { v4 as uuidv4 } from "uuid";
import {
  isSupportedProvider,
  verifySocialToken,
  SocialAuthError,
  type SocialProfile,
} from "../services/socialAuth.service";

// ────────────────────────────────────────────────────────────
// User DTO — canonical response shape
// All auth responses use this. Never expose correo/rol/nombre.
// ────────────────────────────────────────────────────────────

export function buildUserDTO(user: User) {
  return {
    id:    user.id,
    name:  user.nombre,
    email: user.correo,
    role:  user.rol,
  };
}

// ────────────────────────────────────────────────────────────
// Token pair — access token in body + refresh token in cookie
//
// All login/register paths call this single helper so the
// session layer is always consistent.
// ────────────────────────────────────────────────────────────

function issueTokenPair(res: Response, user: User): string {
  const accessToken = signJwt({
    sub:           String(user.id),
    email:         user.correo,
    role:          user.rol,
    token_version: user.token_version,
  });

  const refreshToken = signRefreshToken({
    sub:           String(user.id),
    token_version: user.token_version,
  });

  setRefreshTokenCookie(res, refreshToken);

  return accessToken;
}

// ────────────────────────────────────────────────────────────
// Field resolution — backward compat, internal only
// Accepts canonical (email/password) OR legacy (correo/contraseña).
// These helpers are NEVER exposed in responses.
// ────────────────────────────────────────────────────────────

function resolveEmail(body: Record<string, any>): string | undefined {
  return body.email ?? body.correo;
}

function resolvePassword(body: Record<string, any>): string | undefined {
  return body.password ?? body["contraseña"] ?? body["contrasena"];
}

// ────────────────────────────────────────────────────────────
// POST /api/register — Buyer registration
// ────────────────────────────────────────────────────────────

export const register = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const { nombre, telefono, direccion } = req.body;
    const email = resolveEmail(req.body);
    const plain  = resolvePassword(req.body);

    if (!nombre || !email || !plain) {
      res.status(400).json({
        ok:      false,
        message: "Faltan campos obligatorios: nombre, email, password",
      });
      return;
    }

    const existing = await User.findOne({ where: { correo: email } });

    if (existing) {
      res.status(409).json({
        ok:      false,
        message: "El correo ya está registrado",
      });
      return;
    }

    const hash = await bcrypt.hash(String(plain), 10);

    const newUser = await User.create({
      nombre,
      correo:   email,
      password: hash,
      rol:      "buyer", // 🔒 ALWAYS "buyer" — never trust client input
      telefono: (telefono ?? "").toString().trim(),
      direccion: (direccion ?? "").toString().trim(),
    });

    const token = issueTokenPair(res, newUser);

    res.status(201).json({
      ok:    true,
      token,
      user:  buildUserDTO(newUser),
    });
  } catch (error) {
    console.error("Error en register:", error);
    res.status(500).json({ ok: false, message: "Error al registrar" });
  }
};

// ────────────────────────────────────────────────────────────
// POST /api/register/seller — Seller (KYC) registration
// ────────────────────────────────────────────────────────────

interface MulterFilesMap {
  [fieldname: string]: Express.Multer.File[] | undefined;
}

export const registerVendedor = async (
  req: Request,
  res: Response
): Promise<void> => {
  // ── Validate and check uniqueness BEFORE opening a transaction.
  // This avoids leaking idle transactions on common rejection paths (400/409).
  const {
    nombre,
    telefono,
    password,
    nombreComercio,
    telefonoComercio,
    direccion,
    departamento,
    municipio,
    descripcion,
    dpi,
  } = req.body;

  const email = resolveEmail(req.body);

  if (!nombre || !email || !password || !dpi || !nombreComercio) {
    res.status(400).json({
      ok:      false,
      message: "Faltan campos obligatorios",
    });
    return;
  }

  const existing = await User.findOne({ where: { correo: email } });

  if (existing) {
    res.status(409).json({
      ok:      false,
      message: "El correo ya está registrado",
    });
    return;
  }

  // ── Open transaction only after pre-flight checks pass ──────────────────
  const t = await sequelize.transaction();

  try {
    const hash    = await bcrypt.hash(String(password), 10);
    const newUser = await User.create(
      {
        nombre,
        correo:    email,
        password:  hash,
        rol:       "seller",
        telefono:  (telefono ?? "").toString().trim(),
        direccion: (direccion ?? "").toString().trim(),
      },
      { transaction: t }
    );

    // ── Supabase file upload helper ──
    const files = (req.files as MulterFilesMap | undefined) || {};

    async function uploadToSupabase(
      file:   Express.Multer.File,
      folder: string
    ): Promise<string> {
      const ext      = file.originalname.split(".").pop();
      const fileName = `${folder}/${uuidv4()}.${ext}`;

      const { error } = await supabase.storage
        .from("vendedores_dpi")
        .upload(fileName, file.buffer, {
          contentType: file.mimetype,
          upsert: false,
        });

      if (error) {
        throw new Error(`Error subiendo a Supabase: ${error.message}`);
      }

      const { data: urlData } = supabase.storage
        .from("vendedores_dpi")
        .getPublicUrl(fileName);

      return urlData.publicUrl;
    }

    let fotoFrente: string | null = null;
    let fotoReverso: string | null = null;
    let selfie: string | null = null;
    let logo: string | null = null;

    if (files["foto_dpi_frente"]?.[0]) {
      fotoFrente = await uploadToSupabase(files["foto_dpi_frente"][0], "dpi_frente");
    }
    if (files["foto_dpi_reverso"]?.[0]) {
      fotoReverso = await uploadToSupabase(files["foto_dpi_reverso"][0], "dpi_reverso");
    }
    if (files["selfie_con_dpi"]?.[0]) {
      selfie = await uploadToSupabase(files["selfie_con_dpi"][0], "selfie");
    }
    if (files["logo"]?.[0]) {
      logo = await uploadToSupabase(files["logo"][0], "logos");
    }

    // ── Automated KYC scoring ──
    const kyc = runKYCAnalysis({
      dpi:        dpi.trim(),
      fotoFrente,
      fotoReverso,
      selfie,
    });

    const autoApproved      = kyc.score >= 80;
    const estadoValidacion  = autoApproved
      ? "aprobado"
      : (fotoFrente || fotoReverso || selfie) ? "en_revision" : "pendiente";
    const estadoAdmin = autoApproved ? "activo" : "inactivo";

    await VendedorPerfil.create(
      {
        user_id:          newUser.id,
        nombre:           nombre.trim(),
        email:            email.toLowerCase().trim(),
        // Optional text fields: store empty string when absent, never null,
        // because the vendedor_perfil table has NOT NULL on these columns.
        telefono:          (telefono    ?? "").toString().trim(),
        direccion:         (direccion   ?? "").toString().trim(),
        logo,
        nombre_comercio:   nombreComercio.trim(),
        telefono_comercio: telefonoComercio
          ? { country_code: "502", number: (telefonoComercio as string).trim() }
          : null,
        departamento:      (departamento ?? "").toString().trim(),
        municipio:         (municipio   ?? "").toString().trim(),
        descripcion:       (descripcion ?? "").toString().trim(),
        dpi:              dpi.trim(),
        foto_dpi_frente:  fotoFrente,
        foto_dpi_reverso: fotoReverso,
        selfie_con_dpi:   selfie,
        estado_validacion: estadoValidacion,
        estado_admin:     estadoAdmin,
        observaciones:    null,
        actualizado_en:   new Date(),
        kyc_score:        kyc.score,
        kyc_riesgo:       kyc.riesgo,
        kyc_checklist:    kyc.checklist,
      } as any,
      { transaction: t }
    );

    // issueTokenPair sets the HttpOnly refresh cookie on the response.
    // It must run before commit so that any unexpected throw is still caught
    // by the block below and can roll back cleanly.
    const token = issueTokenPair(res, newUser);
    const userDTO = buildUserDTO(newUser);

    await t.commit();

    // Clear the refresh cookie immediately after registration so the seller
    // is forced back through a clean login before accessing their dashboard.
    // This ensures the entry-point flow runs with a fresh, validated session.
    clearRefreshTokenCookie(res);

    // Response is sent only after a successful commit.
    res.status(201).json({
      ok:          true,
      token,
      user:        userDTO,
      forceLogout: true,
    });
  } catch (error) {
    // Guard against "Transaction already finished" — if commit succeeded but
    // something else threw, rollback is impossible and must be skipped.
    // `t.finished` exists at runtime but is absent from Sequelize's type
    // definitions, so we read it via a cast and also wrap in try/catch.
    if ((t as any).finished !== "commit") {
      try { await t.rollback(); } catch { /* already finished */ }
    }
    console.error("Error en registerVendedor:", error);
    res.status(500).json({ ok: false, message: "Error al registrar vendedor" });
  }
};

// ────────────────────────────────────────────────────────────
// POST /api/login
// ────────────────────────────────────────────────────────────

export const login = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const email = resolveEmail(req.body);
    const plain  = resolvePassword(req.body);

    if (!email || !plain) {
      res.status(400).json({
        ok:      false,
        message: "Email y password son obligatorios",
      });
      return;
    }

    const user = await User.findOne({ where: { correo: email } });

    if (!user) {
      res.status(401).json({ ok: false, message: "Credenciales incorrectas" });
      return;
    }

    const isValid = await bcrypt.compare(String(plain), user.password);

    if (!isValid) {
      res.status(401).json({ ok: false, message: "Credenciales incorrectas" });
      return;
    }

    // ── Seller-specific status checks ──
    let sellerStatus: {
      estado_validacion: string;
      estado_admin: string;
    } | null = null;

    if (user.rol === "seller") {
      const perfil = await VendedorPerfil.findOne({
        where: { user_id: user.id },
      });

      if (perfil) {
        if (perfil.estado_admin === "suspendido") {
          res.status(403).json({
            ok:      false,
            message: "Cuenta suspendida por administración",
          });
          return;
        }

        if (perfil.estado_validacion === "rechazado") {
          res.status(403).json({
            ok:      false,
            message: "Tu solicitud fue rechazada. Contacta soporte.",
          });
          return;
        }

        sellerStatus = {
          estado_validacion: perfil.estado_validacion,
          estado_admin:      perfil.estado_admin,
        };
      }
    }

    const token = issueTokenPair(res, user);

    res.status(200).json({
      ok:    true,
      token,
      user:  buildUserDTO(user),
      ...(sellerStatus && { sellerStatus }),
    });
  } catch (error) {
    console.error("Error en login:", error);
    res.status(500).json({ ok: false, message: "Error interno del servidor" });
  }
};

// ────────────────────────────────────────────────────────────
// PATCH /api/change-password
// ────────────────────────────────────────────────────────────

export const changePassword: RequestHandler = async (req, res) => {
  try {
    const userId = req.user?.id;

    if (!userId) {
      res.status(401).json({ ok: false, message: "Usuario no autenticado" });
      return;
    }

    const { passwordActual, passwordNueva } = req.body;

    if (!passwordActual || !passwordNueva) {
      res.status(400).json({
        ok:      false,
        message: "Debes completar ambos campos",
      });
      return;
    }

    if (passwordNueva.length < 8) {
      res.status(400).json({
        ok:      false,
        message: "La nueva contraseña debe tener mínimo 8 caracteres",
      });
      return;
    }

    const user = await User.findByPk(userId);

    if (!user) {
      res.status(404).json({ ok: false, message: "Usuario no encontrado" });
      return;
    }

    const isValid = await bcrypt.compare(passwordActual, user.password);

    if (!isValid) {
      res.status(400).json({
        ok:      false,
        message: "La contraseña actual es incorrecta",
      });
      return;
    }

    user.password       = await bcrypt.hash(passwordNueva, 12);
    user.token_version += 1;
    await user.save();

    res.status(200).json({
      ok:      true,
      message: "Contraseña actualizada correctamente",
    });
  } catch (error) {
    console.error("Error al cambiar contraseña:", error);
    res.status(500).json({ ok: false, message: "Error interno del servidor" });
  }
};

// ────────────────────────────────────────────────────────────
// POST /api/logout-all — invalidates all tokens via token_version
// ────────────────────────────────────────────────────────────

export const logoutAll: RequestHandler = async (req, res) => {
  try {
    const userId = req.user?.id;

    if (!userId) {
      res.status(401).json({ ok: false, message: "Usuario no autenticado" });
      return;
    }

    const user = await User.findByPk(userId);

    if (!user) {
      res.status(404).json({ ok: false, message: "Usuario no encontrado" });
      return;
    }

    user.token_version += 1;
    await user.save();

    res.status(200).json({
      ok:      true,
      message: "Sesión cerrada en todos los dispositivos",
    });
  } catch (error) {
    console.error("Error en logoutAll:", error);
    res.status(500).json({ ok: false, message: "Error interno del servidor" });
  }
};

// ────────────────────────────────────────────────────────────
// POST /api/forgot-password
// ────────────────────────────────────────────────────────────

export const forgotPassword: RequestHandler = async (req, res) => {
  try {
    const email = resolveEmail(req.body);

    if (!email) {
      res.status(400).json({ ok: false, message: "El email es obligatorio" });
      return;
    }

    const user = await User.findOne({ where: { correo: email } });

    // Always 200 — do not reveal whether the email exists
    if (!user) {
      res.status(200).json({
        ok:      true,
        message: "Si el correo existe, recibirás instrucciones.",
      });
      return;
    }

    const rawToken    = crypto.randomBytes(32).toString("hex");
    const hashedToken = crypto.createHash("sha256").update(rawToken).digest("hex");

    user.reset_password_token   = hashedToken;
    user.reset_password_expires = new Date(Date.now() + 15 * 60 * 1000); // 15 min
    await user.save();

    // Build the full reset URL the user will click in the email.
    const frontendUrl = (process.env.FRONTEND_URL || "http://localhost:3000").replace(/\/$/, "");
    const resetLink   = `${frontendUrl}/restablecer-password?token=${rawToken}`;

    // Send email in a separate try/catch so a delivery failure never returns
    // HTTP 500 to the caller — that would confirm the email exists (enumeration).
    try {
      await sendResetPasswordEmail(user.correo, resetLink, user.nombre);
    } catch (emailError) {
      // Already logged inside sendResetPasswordEmail. Token is saved in DB;
      // the user can request again. We still return 200 below.
      console.error("forgotPassword — email delivery failed (token saved):", emailError);
    }

    res.status(200).json({
      ok:      true,
      message: "Si el correo existe, recibirás instrucciones.",
    });
  } catch (error) {
    console.error("Error en forgotPassword:", error);
    res.status(500).json({ ok: false, message: "Error interno del servidor" });
  }
};

// ────────────────────────────────────────────────────────────
// POST /api/reset-password
// ────────────────────────────────────────────────────────────

export const resetPassword: RequestHandler = async (req, res) => {
  try {
    const { token, passwordNueva } = req.body;

    if (!token || !passwordNueva) {
      res.status(400).json({
        ok:      false,
        code:    "VALIDATION_ERROR",
        message: "Token y nueva contraseña requeridos",
      });
      return;
    }

    if (passwordNueva.length < 8) {
      res.status(400).json({
        ok:      false,
        code:    "VALIDATION_ERROR",
        message: "La nueva contraseña debe tener mínimo 8 caracteres",
      });
      return;
    }

    const hashedToken = crypto.createHash("sha256").update(token).digest("hex");
    const user        = await User.findOne({
      where: { reset_password_token: hashedToken },
    });

    if (!user) {
      res.status(400).json({
        ok:      false,
        code:    "TOKEN_INVALID",
        message: "El enlace no es válido.",
      });
      return;
    }

    if (
      !user.reset_password_expires ||
      user.reset_password_expires < new Date()
    ) {
      res.status(400).json({
        ok:      false,
        code:    "TOKEN_EXPIRED",
        message: "El enlace ha expirado. Solicita uno nuevo.",
      });
      return;
    }

    user.password               = await bcrypt.hash(passwordNueva, 12);
    user.token_version         += 1;
    user.reset_password_token   = null;
    user.reset_password_expires = null;
    await user.save();

    res.status(200).json({
      ok:      true,
      message: "Contraseña actualizada correctamente.",
    });
  } catch (error) {
    console.error("Error en resetPassword:", error);
    res.status(500).json({
      ok:      false,
      code:    "INTERNAL_ERROR",
      message: "Error interno del servidor",
    });
  }
};

// ────────────────────────────────────────────────────────────
// Shared helper — find or create a user from a verified social profile.
//
// New social users are always created as "buyer".
// Password field is NOT NULL, so we store an unusable placeholder:
//   bcrypt(randomBytes(32)) — cleartext never stored, never matchable.
// Existing users keep their current role.
// ────────────────────────────────────────────────────────────

async function findOrCreateSocialUser(
  profile: SocialProfile,
): Promise<{ user: User; isNew: boolean }> {
  const email = profile.email.toLowerCase().trim();
  let user = await User.findOne({ where: { correo: email } });

  if (!user) {
    const placeholderHash = await bcrypt.hash(
      crypto.randomBytes(32).toString("hex"),
      10,
    );
    const displayName = (profile.name ?? email.split("@")[0]).trim();
    user = await User.create({
      nombre:    displayName,
      correo:    email,
      password:  placeholderHash,
      rol:       "buyer",
      telefono:  "",
      direccion: "",
    });
    return { user, isNew: true };
  }

  return { user, isNew: false };
}

// ────────────────────────────────────────────────────────────
// POST /api/auth/social — unified social login endpoint
//
// Body: { provider: "google" | "facebook" | "apple", id_token: string }
//
// Each provider verifier lives in socialAuth.service.ts and returns
// a normalised SocialProfile. The controller handles HTTP semantics.
// Rate limited to 20 req / 15 min (same as /api/login/google).
// ────────────────────────────────────────────────────────────

export const loginWithSocial: RequestHandler = async (req, res) => {
  try {
    const { provider, id_token } = req.body as { provider?: unknown; id_token?: unknown };

    if (!isSupportedProvider(provider)) {
      res.status(400).json({
        ok:      false,
        message: "Proveedor no soportado. Usa: google, facebook o apple.",
        code:    "UNSUPPORTED_PROVIDER",
      });
      return;
    }

    if (!id_token || typeof id_token !== "string") {
      res.status(400).json({
        ok:      false,
        message: "id_token requerido",
        code:    "MISSING_TOKEN",
      });
      return;
    }

    let profile: SocialProfile;
    try {
      profile = await verifySocialToken(provider, id_token);
    } catch (err) {
      if (err instanceof SocialAuthError) {
        const status =
          err.code === "GOOGLE_NOT_CONFIGURED"  ? 503 :
          err.code === "PROVIDER_NOT_IMPLEMENTED" ? 501 :
          err.code === "EMAIL_NOT_VERIFIED"      ? 403 : 401;
        res.status(status).json({ ok: false, message: err.message, code: err.code });
        return;
      }
      throw err;
    }

    if (!profile.email || !profile.emailVerified) {
      res.status(403).json({
        ok:      false,
        message: "El correo de la cuenta social no está verificado.",
        code:    "EMAIL_NOT_VERIFIED",
      });
      return;
    }

    const { user, isNew } = await findOrCreateSocialUser(profile);
    const token = issueTokenPair(res, user);

    res.status(200).json({ ok: true, token, user: buildUserDTO(user), is_new_user: isNew });
  } catch (error) {
    console.error("Error en loginWithSocial:", error);
    res.status(500).json({ ok: false, message: "Error interno del servidor" });
  }
};

// ────────────────────────────────────────────────────────────
// POST /api/login/google — backward-compatible Google login
//
// Thin wrapper around loginWithSocial. Kept so existing clients
// that POST { id_token } to /api/login/google continue to work.
// New clients should use POST /api/auth/social with provider:"google".
// ────────────────────────────────────────────────────────────

export const loginWithGoogle: RequestHandler = async (req, res) => {
  // Inject provider so loginWithSocial can dispatch to verifyGoogleToken
  req.body = { provider: "google", id_token: req.body?.id_token };
  return loginWithSocial(req, res, () => {});
};

// ────────────────────────────────────────────────────────────
// POST /api/logout — single-device logout
//
// Clears the HttpOnly refresh token cookie. The access token
// remains valid until it expires (JWT_EXPIRES_IN, default 15m).
// For immediate full invalidation across all devices, use
// POST /api/logout-all which increments token_version.
// ────────────────────────────────────────────────────────────

export const logout: RequestHandler = (_req, res) => {
  clearRefreshTokenCookie(res);
  res.status(200).json({ ok: true, message: "Sesión cerrada correctamente" });
};

// ────────────────────────────────────────────────────────────
// POST /api/refresh — silent access token renewal
//
// Reads the refresh token from the HttpOnly cookie, validates it
// against the DB, and issues a fresh access token + rotated
// refresh token. The old refresh token is replaced on every call.
//
// Returns the same shape as login so the frontend can consume it
// identically. Clears the cookie and returns 401 on any failure.
// ────────────────────────────────────────────────────────────

export const refresh: RequestHandler = async (req, res) => {
  try {
    const rawToken = req.cookies?.[REFRESH_TOKEN_COOKIE] as string | undefined;

    if (!rawToken) {
      res.status(401).json({ ok: false, message: "No hay sesión activa" });
      return;
    }

    // Verify signature and expiry against the refresh secret
    let decoded;
    try {
      decoded = verifyRefreshToken(rawToken);
    } catch {
      clearRefreshTokenCookie(res);
      res.status(401).json({ ok: false, message: "Sesión expirada. Inicia sesión nuevamente." });
      return;
    }

    // Load user — token_version check happens before issuing anything
    const user = await User.findByPk(decoded.sub);

    if (!user) {
      clearRefreshTokenCookie(res);
      res.status(401).json({ ok: false, message: "Usuario no encontrado" });
      return;
    }

    // token_version mismatch means logoutAll was called — reject
    if (decoded.token_version !== user.token_version) {
      clearRefreshTokenCookie(res);
      res.status(401).json({
        ok:      false,
        message: "Sesión inválida. Inicia sesión nuevamente.",
      });
      return;
    }

    // Suspended accounts cannot refresh
    if ((user as any).estado === "suspendido") {
      clearRefreshTokenCookie(res);
      res.status(403).json({ ok: false, message: "Cuenta suspendida" });
      return;
    }

    // Issue new access token + rotate refresh token (new cookie replaces old)
    const token = issueTokenPair(res, user);

    res.status(200).json({
      ok:   true,
      token,
      user: buildUserDTO(user),
    });
  } catch (error) {
    console.error("Error en refresh:", error);
    res.status(500).json({ ok: false, message: "Error interno del servidor" });
  }
};

// ────────────────────────────────────────────────────────────
// GET /api/session — lightweight session probe
//
// Reads the HttpOnly refresh-token cookie (fj_rt), validates it
// against the DB, and returns the canonical user DTO.
//
// Does NOT require the short-lived access token — it is designed
// for server-to-server calls from Next.js middleware and for the
// frontend session probe on first load.
//
// Does NOT rotate the refresh token — this is a read-only check.
// Use POST /api/refresh to obtain a new access token.
// ────────────────────────────────────────────────────────────

export const getSession: RequestHandler = async (req, res) => {
  try {
    const rawToken = req.cookies?.[REFRESH_TOKEN_COOKIE] as string | undefined;

    if (!rawToken) {
      console.log("[session] fj_rt cookie missing — returning 401");
      res.status(401).json({ ok: false, message: "No hay sesión activa" });
      return;
    }

    // Verify refresh-token signature and expiry
    let decoded;
    try {
      decoded = verifyRefreshToken(rawToken);
    } catch (err) {
      console.log("[session] JWT verification failed:", (err as Error).message);
      clearRefreshTokenCookie(res);
      res.status(401).json({ ok: false, message: "Sesión expirada. Inicia sesión nuevamente." });
      return;
    }

    // Load user — validates existence
    const user = await User.findByPk(decoded.sub);

    if (!user) {
      clearRefreshTokenCookie(res);
      res.status(401).json({ ok: false, message: "Usuario no encontrado" });
      return;
    }

    // token_version mismatch — logoutAll was called since this token was issued
    if (decoded.token_version !== user.token_version) {
      clearRefreshTokenCookie(res);
      res.status(401).json({ ok: false, message: "Sesión inválida. Inicia sesión nuevamente." });
      return;
    }

    // Suspended accounts cannot have active sessions
    if ((user as any).estado === "suspendido") {
      clearRefreshTokenCookie(res);
      res.status(403).json({ ok: false, message: "Cuenta suspendida" });
      return;
    }

    res.status(200).json({
      ok:   true,
      user: buildUserDTO(user),
    });
  } catch (error) {
    console.error("Error en getSession:", error);
    res.status(500).json({ ok: false, message: "Error interno del servidor" });
  }
};

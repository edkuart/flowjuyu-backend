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
import { v4 as uuidv4 } from "uuid";
import { uploadKycFile, uploadPublicFile } from "../lib/kycStorage";
import {
  isSupportedProvider,
  verifySocialToken,
  SocialAuthError,
  type SocialProfile,
} from "../services/socialAuth.service";
import {
  getCachedSession,
  setCachedSession,
  invalidateSession,
} from "../lib/sessionCache";
import { logAuditEventFromRequest } from "../services/audit.service";
import {
  recordRegistrationConsents,
  resolveConsentAccess,
  buildSessionConsentContract,
} from "../services/consent.service";
import { checkLoginAbuse } from "../services/abuseDetection.service";
import { LOGIN_RULES } from "../config/securityRules";
import { evaluateLoginDefense } from "../services/activeDefense.service";

const USER_AUTH_READ_ATTRIBUTES = [
  "id",
  "nombre",
  "correo",
  "password",
  "rol",
  "telefono",
  "direccion",
  "createdAt",
  "updatedAt",
  "token_version",
  "reset_password_token",
  "reset_password_expires",
] as const;

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

async function buildAuthEnvelope(user: User) {
  const resolvedConsent = await resolveConsentAccess(user.id);
  const consent = buildSessionConsentContract(resolvedConsent);

  return {
    user: buildUserDTO(user),
    consent,
    ...(consent.needsConsent
      ? {
          needsConsent: true,
          currentVersion:
            consent.activeVersions.terms?.versionCode ??
            consent.activeVersions.privacy?.versionCode ??
            null,
        }
      : {}),
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

    const existing = await User.findOne({
      where: { correo: email },
      attributes: ["id"],
    });

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

    // Record consent — best-effort after user creation.
    // A failure here must NOT fail the registration response since the user
    // account already exists. The gap is resolved by re-consent on next login
    // once the middleware enforcement is active (Block 3+).
    recordRegistrationConsents(newUser.id, {
      accepted:  true,
      source:    "registration_buyer",
      ipAddress: req.ip ?? null,
      userAgent: req.get("user-agent") ?? null,
    }).catch((consentErr) =>
      console.error("[consent] buyer registration consent failed:", consentErr),
    );

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

  const existing = await User.findOne({
    where: { correo: email },
    attributes: ["id"],
  });

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

    // ── Supabase file upload helpers ──
    //
    // uploadKycDoc  → returns storage PATH (key). Used for PII documents (DPI,
    //                 selfie). Served only via time-limited signed URLs.
    // uploadLogoPub → returns permanent public URL. Used for the commercial logo,
    //                 which is a public asset and not subject to PII restrictions.
    const files = (req.files as MulterFilesMap | undefined) || {};

    async function uploadKycDoc(
      file:   Express.Multer.File,
      folder: string,
    ): Promise<string> {
      const ext      = file.originalname.split(".").pop();
      const fileName = `${uuidv4()}.${ext}`;
      return uploadKycFile(folder, fileName, file.buffer, file.mimetype);
    }

    async function uploadLogoPub(file: Express.Multer.File): Promise<string> {
      const ext      = file.originalname.split(".").pop();
      const fileName = `${uuidv4()}.${ext}`;
      return uploadPublicFile("logos", fileName, file.buffer, file.mimetype);
    }

    let fotoFrente: string | null = null;
    let fotoReverso: string | null = null;
    let selfie: string | null = null;
    let logo: string | null = null;

    if (files["foto_dpi_frente"]?.[0]) {
      fotoFrente = await uploadKycDoc(files["foto_dpi_frente"][0], "dpi_frente");
    }
    if (files["foto_dpi_reverso"]?.[0]) {
      fotoReverso = await uploadKycDoc(files["foto_dpi_reverso"][0], "dpi_reverso");
    }
    if (files["selfie_con_dpi"]?.[0]) {
      selfie = await uploadKycDoc(files["selfie_con_dpi"][0], "selfie");
    }
    if (files["logo"]?.[0]) {
      logo = await uploadLogoPub(files["logo"][0]);
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

    // Record consent after commit — uses its own internal transaction so a
    // consent failure cannot roll back the seller registration.
    recordRegistrationConsents(newUser.id, {
      accepted:  true,
      source:    "registration_seller",
      ipAddress: req.ip ?? null,
      userAgent: req.get("user-agent") ?? null,
    }).catch((consentErr) =>
      console.error("[consent] seller registration consent failed:", consentErr),
    );

    void logAuditEventFromRequest(req, {
      actor_user_id: newUser.id,
      actor_role:    "seller",
      action:        "seller.register.success",
      entity_type:   "seller",
      entity_id:     String(newUser.id),
      status:        "success",
      severity:      "medium",
      metadata: {
        kyc_score:          kyc.score,
        kyc_riesgo:         kyc.riesgo,
        estado_validacion:  estadoValidacion,
        has_dpi_frente:     !!fotoFrente,
        has_dpi_reverso:    !!fotoReverso,
        has_selfie:         !!selfie,
        has_logo:           !!logo,
      },
    });

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
    void logAuditEventFromRequest(req, {
      actor_user_id: null,
      actor_role:    "anonymous",
      action:        "seller.register.failed",
      status:        "failed",
      severity:      "high",
      metadata:      { reason: (error as Error)?.message },
    });
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
    const abuseCheck = await checkLoginAbuse({
      ip:    req.ip ?? req.socket?.remoteAddress ?? "unknown",
      email: email ?? null,
    });

    if (abuseCheck.blocked) {
      void logAuditEventFromRequest(req, {
        actor_user_id: null,
        actor_role:    "anonymous",
        action:        "auth.login.blocked",
        status:        "blocked",
        severity:      "critical",
        metadata: {
          reason:        abuseCheck.reason,
          threshold:     LOGIN_RULES.maxAttempts,
          windowMinutes: LOGIN_RULES.windowMinutes,
          retryAfter:    abuseCheck.retryAfter,
        },
      });
      res.setHeader("Retry-After", String(abuseCheck.retryAfter ?? LOGIN_RULES.blockDurationMinutes * 60));
      res.status(429).json({
        ok:      false,
        code:    "ABUSE_PROTECTION_TRIGGERED",
        message: "Too many attempts. Please try again later.",
      });
      return;
    }

    if (!email || !plain) {
      res.status(400).json({
        ok:      false,
        message: "Email y password son obligatorios",
      });
      return;
    }

    const user = await User.findOne({
      where: { correo: email },
      attributes: USER_AUTH_READ_ATTRIBUTES as unknown as string[],
    });

    if (user?.rol !== "admin") {
      const defense = await evaluateLoginDefense({
        ip:     req.ip ?? req.socket?.remoteAddress ?? "unknown",
        email,
        userId: user?.id,
      });

      if (defense.decision === "cooldown" || defense.decision === "deny") {
        void logAuditEventFromRequest(req, {
          actor_user_id: user?.id ?? null,
          actor_role:    user?.rol ?? "anonymous",
          action:        defense.decision === "cooldown"
            ? "defense.login.cooldown_applied"
            : "defense.login.deny_applied",
          entity_type:   user ? "user" : null,
          entity_id:     user ? String(user.id) : null,
          status:        "blocked",
          severity:      defense.decision === "deny" ? "critical" : "high",
          metadata: {
            reason:              defense.reason,
            retryAfter:          defense.retryAfter,
            restrictionCreated:  defense.restrictionCreated ?? false,
          },
        });
        if (defense.retryAfter) {
          res.setHeader("Retry-After", String(defense.retryAfter));
        }
        res.status(429).json({
          ok:      false,
          code:    "ACTIVE_DEFENSE_TRIGGERED",
          message: "Action temporarily restricted. Please try again later.",
        });
        return;
      }
    }

    if (!user) {
      void logAuditEventFromRequest(req, {
        actor_user_id: null,
        actor_role:    "anonymous",
        action:        "auth.login.failed",
        status:        "failed",
        severity:      "high",
        metadata:      { reason: "user_not_found", email },
      });
      res.status(401).json({ ok: false, message: "Credenciales incorrectas" });
      return;
    }

    const isValid = await bcrypt.compare(String(plain), user.password);

    if (!isValid) {
      void logAuditEventFromRequest(req, {
        actor_user_id: user.id,
        actor_role:    user.rol,
        action:        "auth.login.failed",
        entity_type:   "user",
        entity_id:     String(user.id),
        status:        "failed",
        severity:      "high",
        metadata:      { reason: "wrong_password" },
      });
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
        if (perfil.estado_admin === "eliminado") {
          void logAuditEventFromRequest(req, {
            actor_user_id: user.id,
            actor_role:    user.rol,
            action:        "auth.login.failed",
            entity_type:   "user",
            entity_id:     String(user.id),
            status:        "blocked",
            severity:      "critical",
            metadata:      { reason: "account_eliminated" },
          });
          res.status(403).json({
            ok:      false,
            message: "Esta cuenta ha sido eliminada",
          });
          return;
        }

        if (perfil.estado_admin === "suspendido") {
          void logAuditEventFromRequest(req, {
            actor_user_id: user.id,
            actor_role:    user.rol,
            action:        "auth.login.failed",
            entity_type:   "user",
            entity_id:     String(user.id),
            status:        "blocked",
            severity:      "high",
            metadata:      { reason: "account_suspended" },
          });
          res.status(403).json({
            ok:      false,
            message: "Cuenta suspendida por administración",
          });
          return;
        }

        if (perfil.estado_validacion === "rechazado") {
          void logAuditEventFromRequest(req, {
            actor_user_id: user.id,
            actor_role:    user.rol,
            action:        "auth.login.failed",
            entity_type:   "user",
            entity_id:     String(user.id),
            status:        "blocked",
            severity:      "medium",
            metadata:      { reason: "kyc_rejected" },
          });
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
    const authEnvelope = await buildAuthEnvelope(user);

    void logAuditEventFromRequest(req, {
      actor_user_id: user.id,
      actor_role:    user.rol,
      action:        "auth.login.success",
      entity_type:   "user",
      entity_id:     String(user.id),
      status:        "success",
      severity:      "low",
    });

    res.status(200).json({
      ok:    true,
      token,
      ...authEnvelope,
      ...(sellerStatus  && { sellerStatus }),
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

    const user = await User.findByPk(userId, {
      attributes: USER_AUTH_READ_ATTRIBUTES as unknown as string[],
    });

    if (!user) {
      res.status(404).json({ ok: false, message: "Usuario no encontrado" });
      return;
    }

    const isValid = await bcrypt.compare(passwordActual, user.password);

    if (!isValid) {
      void logAuditEventFromRequest(req, {
        actor_user_id: user.id,
        actor_role:    user.rol,
        action:        "auth.password.change.failed",
        entity_type:   "user",
        entity_id:     String(user.id),
        status:        "failed",
        severity:      "medium",
        metadata:      { reason: "wrong_current_password" },
      });
      res.status(400).json({
        ok:      false,
        message: "La contraseña actual es incorrecta",
      });
      return;
    }

    user.password       = await bcrypt.hash(passwordNueva, 12);
    user.token_version += 1;
    await user.save();

    void logAuditEventFromRequest(req, {
      actor_user_id: user.id,
      actor_role:    user.rol,
      action:        "auth.password.change.success",
      entity_type:   "user",
      entity_id:     String(user.id),
      status:        "success",
      severity:      "medium",
    });

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

    const user = await User.findByPk(userId, {
      attributes: USER_AUTH_READ_ATTRIBUTES as unknown as string[],
    });

    if (!user) {
      res.status(404).json({ ok: false, message: "Usuario no encontrado" });
      return;
    }

    user.token_version += 1;
    await user.save();

    // Evict cached session immediately so the next /session hits the DB
    invalidateSession(user.id);

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

    const user = await User.findOne({
      where: { correo: email },
      attributes: USER_AUTH_READ_ATTRIBUTES as unknown as string[],
    });

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
      attributes: USER_AUTH_READ_ATTRIBUTES as unknown as string[],
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
  let user = await User.findOne({
    where: { correo: email },
    attributes: USER_AUTH_READ_ATTRIBUTES as unknown as string[],
  });

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
          err.code === "PROVIDER_NOT_IMPLEMENTED" ? 501 :
          err.code === "EMAIL_NOT_VERIFIED" ? 403 : 401;
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

    // Record consent for genuinely new users only.
    // Returning social users already have their consent on record.
    if (isNew) {
      recordRegistrationConsents(user.id, {
        accepted:  true,
        source:    "registration_social",
        ipAddress: req.ip ?? null,
        userAgent: req.get("user-agent") ?? null,
      }).catch((consentErr) =>
        console.error("[consent] social registration consent failed:", consentErr),
      );
    }

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

export const logout: RequestHandler = async (req, res) => {
  // Bump token_version so that any concurrent /api/refresh response that
  // lands in the browser AFTER the cookie-clear cannot restore the session.
  //
  // Without this, the following race is possible:
  //   1. apiFetch 401 → refreshSession() → POST /api/refresh (in-flight)
  //   2. User clicks logout → POST /api/logout → browser clears fj_rt cookie
  //   3. Browser receives /api/refresh response → sets a NEW valid fj_rt cookie
  //   4. Page navigates to /login WITH the new cookie → session still valid → loop
  //
  // Incrementing token_version invalidates all existing refresh tokens for
  // this user, so the new cookie from step 3 will fail /api/session's
  // token_version check and return 401 — even if the cookie is present.
  const rawToken = req.cookies?.[REFRESH_TOKEN_COOKIE] as string | undefined;

  if (rawToken) {
    try {
      const decoded = verifyRefreshToken(rawToken);
      const userId   = Number(decoded.sub);

      const user = await User.findByPk(userId, {
        attributes: ["id", "token_version"],
      });

      if (user) {
        user.token_version += 1;
        await user.save();
        invalidateSession(userId);
      }
    } catch {
      // Token invalid or DB error — still clear the cookie and return 200.
      // A tampered/expired token doesn't require a DB write to be invalidated.
    }
  }

  // actor context may be absent if the access token has already expired
  const actor = req.user;
  void logAuditEventFromRequest(req, {
    actor_user_id: actor?.id  ?? null,
    actor_role:    actor?.role ?? "anonymous",
    action:        "auth.logout.success",
    entity_type:   actor ? "user" : null,
    entity_id:     actor ? String(actor.id) : null,
    status:        "success",
    severity:      "low",
  });

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
      void logAuditEventFromRequest(req, {
        actor_user_id: null,
        actor_role:    "anonymous",
        action:        "auth.refresh.failed",
        status:        "failed",
        severity:      "medium",
        metadata:      { reason: "invalid_or_expired_token" },
      });
      clearRefreshTokenCookie(res);
      res.status(401).json({ ok: false, message: "Sesión expirada. Inicia sesión nuevamente." });
      return;
    }

    // Load user — token_version check happens before issuing anything
    const user = await User.findByPk(decoded.sub, {
      attributes: ["id", "nombre", "correo", "rol", "token_version"],
    });

    if (!user) {
      void logAuditEventFromRequest(req, {
        actor_user_id: Number(decoded.sub) || null,
        actor_role:    "unknown",
        action:        "auth.refresh.failed",
        status:        "failed",
        severity:      "high",
        metadata:      { reason: "user_not_found", sub: decoded.sub },
      });
      clearRefreshTokenCookie(res);
      res.status(401).json({ ok: false, message: "Usuario no encontrado" });
      return;
    }

    // token_version mismatch means logoutAll was called — reject
    if (decoded.token_version !== user.token_version) {
      void logAuditEventFromRequest(req, {
        actor_user_id: user.id,
        actor_role:    user.rol,
        action:        "auth.refresh.failed",
        entity_type:   "user",
        entity_id:     String(user.id),
        status:        "blocked",
        severity:      "high",
        metadata:      { reason: "token_version_mismatch" },
      });
      clearRefreshTokenCookie(res);
      res.status(401).json({
        ok:      false,
        message: "Sesión inválida. Inicia sesión nuevamente.",
      });
      return;
    }

    // Suspended accounts cannot refresh
    if ((user as any).estado === "suspendido") {
      void logAuditEventFromRequest(req, {
        actor_user_id: user.id,
        actor_role:    user.rol,
        action:        "auth.refresh.failed",
        entity_type:   "user",
        entity_id:     String(user.id),
        status:        "blocked",
        severity:      "high",
        metadata:      { reason: "account_suspended" },
      });
      clearRefreshTokenCookie(res);
      res.status(403).json({ ok: false, message: "Cuenta suspendida" });
      return;
    }

    // Issue new access token + rotate refresh token (new cookie replaces old)
    const token = issueTokenPair(res, user);
    const authEnvelope = await buildAuthEnvelope(user);

    void logAuditEventFromRequest(req, {
      actor_user_id: user.id,
      actor_role:    user.rol,
      action:        "auth.refresh.success",
      entity_type:   "user",
      entity_id:     String(user.id),
      status:        "success",
      severity:      "low",
    });

    res.status(200).json({
      ok:   true,
      token,
      ...authEnvelope,
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

    // Verify refresh-token signature and expiry (CPU-only, no DB)
    let decoded;
    try {
      decoded = verifyRefreshToken(rawToken);
    } catch (err) {
      console.log("[session] JWT verification failed:", (err as Error).message);
      clearRefreshTokenCookie(res);
      res.status(401).json({ ok: false, message: "Sesión expirada. Inicia sesión nuevamente." });
      return;
    }

    const userId = Number(decoded.sub);

    // ── Fast path: cache hit ──────────────────────────────────────────────
    const cached = getCachedSession(userId, decoded.token_version);
    if (cached) {
      res.status(200).json({
        ok: true,
        user: {
          id: cached.id,
          name: cached.nombre,
          email: cached.correo,
          role: cached.rol,
        },
        consent: cached.consent,
        ...(cached.consent.needsConsent
          ? {
              needsConsent: true,
              currentVersion:
                cached.consent.activeVersions.terms?.versionCode ??
                cached.consent.activeVersions.privacy?.versionCode ??
                null,
            }
          : {}),
      });
      return;
    }

    // ── Slow path: DB lookup ──────────────────────────────────────────────
    const user = await User.findByPk(userId, {
      attributes: ["id", "nombre", "correo", "rol", "token_version"],
    });

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

    const authEnvelope = await buildAuthEnvelope(user);

    // Populate cache for subsequent requests within the TTL window
    setCachedSession({
      id:            user.id,
      nombre:        user.nombre,
      correo:        user.correo,
      rol:           user.rol,
      consent:       authEnvelope.consent,
      token_version: user.token_version,
    });

    res.status(200).json({
      ok: true,
      ...authEnvelope,
    });
  } catch (error) {
    console.error("Error en getSession:", error);
    res.status(500).json({ ok: false, message: "Error interno del servidor" });
  }
};

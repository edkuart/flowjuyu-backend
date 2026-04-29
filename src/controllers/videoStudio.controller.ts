import { RequestHandler } from "express";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { QueryTypes } from "sequelize";
import { sequelize } from "../config/db";
import supabase from "../lib/supabase";
import {
  getVideoProvider,
  assertAllowedCombination,
  estimateCostCents,
  PROVIDER_MODELS,
} from "../services/videoStudio/providers";
import { uploadVideoFromUrl } from "../services/videoStudio/videoStorage.service";
import {
  deductAiCredits,
  refundAiCredits,
  getAiCreditsBalance,
  InsufficientAiCreditsError,
  type AiCreditOperation,
} from "../services/aiCredits.service";

type AuthUser = { id: number };
const VIDEO_ASSET_BUCKET = "video-assets";
const IMAGE_MIME_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
]);

function getUser(req: unknown): AuthUser | null {
  const u = (req as { user?: AuthUser }).user;
  return u?.id ? u : null;
}

function str(v: unknown, max: number): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t ? t.slice(0, max) : null;
}

function safeFileStem(filename: string): string {
  return (
    path
      .parse(filename || "asset")
      .name.replace(/[^a-zA-Z0-9_\-]/g, "_")
      .slice(0, 60) || "asset"
  );
}

function extensionFor(file: Express.Multer.File): string {
  const ext = path
    .extname(file.originalname || "")
    .replace(".", "")
    .toLowerCase();
  if (ext) return ext;
  if (file.mimetype === "image/png") return "png";
  if (file.mimetype === "image/webp") return "webp";
  if (file.mimetype === "image/gif") return "gif";
  return "jpg";
}

function aiOperationForVideo(
  provider: string,
  model: string,
): AiCreditOperation | null {
  if (provider === "mock") return null;
  if (provider === "runway" || model.toLowerCase().includes("runway")) {
    return "video_10s_runway";
  }
  if (model.toLowerCase().includes("kling")) return "video_10s_kling";
  return "video_10s_luma";
}

async function ensureVideoAssetBucket(): Promise<void> {
  const { error } = await supabase.storage.createBucket(VIDEO_ASSET_BUCKET, {
    public: true,
    allowedMimeTypes: Array.from(IMAGE_MIME_TYPES),
    fileSizeLimit: 8 * 1024 * 1024,
  });

  if (
    error &&
    !error.message?.includes("already exists") &&
    (error as any)?.error !== "Duplicate"
  ) {
    throw new Error(error.message);
  }
}

// ─── Provider config (pública para el frontend) ───────────────────────────────

export const getProviderModels: RequestHandler = async (_req, res) => {
  res.json({ providers: PROVIDER_MODELS });
};

// ─── Templates ───────────────────────────────────────────────────────────────

export const getTemplates: RequestHandler = async (_req, res) => {
  const rows = await sequelize.query(
    `SELECT id, slug, name, objective, format, duration_seconds,
            prompt_template, style_config, thumbnail_url
     FROM video_templates
     WHERE is_active = true
     ORDER BY objective, name`,
    { type: QueryTypes.SELECT },
  );
  res.json({ templates: rows });
};

// ─── Projects ────────────────────────────────────────────────────────────────

export const listProjects: RequestHandler = async (req, res) => {
  const user = getUser(req);
  if (!user) {
    res.status(401).json({ error: "No autenticado" });
    return;
  }

  const projects = await sequelize.query(
    `SELECT vp.id, vp.title, vp.objective, vp.status, vp.format,
            vp.duration_seconds, vp.prompt, vp.style_preset,
            vp.thumbnail_url, vp.created_at, vp.updated_at,
            vt.name AS template_name, vt.slug AS template_slug,
            (
              SELECT json_build_object(
                'id', vg.id,
                'status', vg.status,
                'provider', vg.provider,
                'model', vg.model,
                'preview_url', vg.preview_url,
                'output_url', vg.output_url,
                'created_at', vg.created_at
              )
              FROM video_generations vg
              WHERE vg.project_id = vp.id
              ORDER BY vg.created_at DESC
              LIMIT 1
            ) AS last_generation
     FROM video_projects vp
     LEFT JOIN video_templates vt ON vt.id = vp.template_id
     WHERE vp.seller_id = :sellerId
     ORDER BY vp.updated_at DESC
     LIMIT 50`,
    { replacements: { sellerId: user.id }, type: QueryTypes.SELECT },
  );

  res.json({ projects });
};

export const createProject: RequestHandler = async (req, res) => {
  const user = getUser(req);
  if (!user) {
    res.status(401).json({ error: "No autenticado" });
    return;
  }

  const body = req.body as Record<string, unknown>;
  const title = str(body.title, 160) ?? "Sin título";
  const objective = str(body.objective, 32);
  const format = str(body.format, 8) ?? "9:16";
  const duration =
    typeof body.duration_seconds === "number"
      ? Math.min(body.duration_seconds, 60)
      : 10;
  const templateId = str(body.template_id, 64);
  const prompt = str(body.prompt, 1000);
  const stylePreset = str(body.style_preset, 64);

  const validObjectives = ["product", "promo", "live", "collection"];
  if (!objective || !validObjectives.includes(objective)) {
    res.status(400).json({ error: "Objetivo inválido" });
    return;
  }

  const [row] = await sequelize.query(
    `INSERT INTO video_projects
       (seller_id, title, objective, status, format, duration_seconds, template_id, prompt, style_preset)
     VALUES (:sellerId, :title, :objective, 'draft', :format, :duration, :templateId, :prompt, :stylePreset)
     RETURNING id, title, objective, status, format, duration_seconds, template_id, prompt, style_preset, created_at`,
    {
      replacements: {
        sellerId: user.id,
        title,
        objective,
        format,
        duration,
        templateId: templateId ?? null,
        prompt: prompt ?? null,
        stylePreset: stylePreset ?? null,
      },
      type: QueryTypes.SELECT,
    },
  );

  res.status(201).json({ project: row });
};

export const getProject: RequestHandler = async (req, res) => {
  const user = getUser(req);
  if (!user) {
    res.status(401).json({ error: "No autenticado" });
    return;
  }

  const { id } = req.params;

  const [project] = await sequelize.query(
    `SELECT vp.*, vt.name AS template_name, vt.slug AS template_slug,
            vt.prompt_template, vt.style_config AS template_style_config
     FROM video_projects vp
     LEFT JOIN video_templates vt ON vt.id = vp.template_id
     WHERE vp.id = :id AND vp.seller_id = :sellerId`,
    { replacements: { id, sellerId: user.id }, type: QueryTypes.SELECT },
  );

  if (!project) {
    res.status(404).json({ error: "Proyecto no encontrado" });
    return;
  }

  const assets = await sequelize.query(
    `SELECT id, product_id, asset_type, source_url, storage_path, metadata, sort_order
     FROM video_assets WHERE project_id = :id ORDER BY sort_order`,
    { replacements: { id }, type: QueryTypes.SELECT },
  );

  const generations = await sequelize.query(
    `SELECT id, status, provider, model, prompt_snapshot,
            preview_url, output_url, storage_path, file_size_bytes,
            error_code, error_message, cost_estimated_cents, cost_actual_cents,
            started_at, completed_at, created_at
     FROM video_generations
     WHERE project_id = :id
     ORDER BY created_at DESC
     LIMIT 10`,
    { replacements: { id }, type: QueryTypes.SELECT },
  );

  res.json({ project, assets, generations });
};

export const updateProject: RequestHandler = async (req, res) => {
  const user = getUser(req);
  if (!user) {
    res.status(401).json({ error: "No autenticado" });
    return;
  }

  const { id } = req.params;
  const body = req.body as Record<string, unknown>;

  const sets: string[] = ["updated_at = NOW()"];
  const replacements: Record<string, unknown> = { id, sellerId: user.id };

  if (typeof body.title === "string") {
    sets.push("title = :title");
    replacements.title = body.title.trim().slice(0, 160) || "Sin título";
  }
  if (typeof body.prompt === "string") {
    sets.push("prompt = :prompt");
    replacements.prompt = body.prompt.trim().slice(0, 1000) || null;
  }
  if (typeof body.style_preset === "string") {
    sets.push("style_preset = :stylePreset");
    replacements.stylePreset = body.style_preset.trim().slice(0, 64) || null;
  }
  if (
    typeof body.status === "string" &&
    ["draft", "ready", "archived"].includes(body.status)
  ) {
    sets.push("status = :status");
    replacements.status = body.status;
  }
  if (typeof body.template_id === "string") {
    sets.push("template_id = :templateId");
    replacements.templateId = body.template_id;
  }

  const [updated] = await sequelize.query(
    `UPDATE video_projects SET ${sets.join(", ")}
     WHERE id = :id AND seller_id = :sellerId
     RETURNING id, title, objective, status, format, duration_seconds, prompt, style_preset, template_id, updated_at`,
    { replacements, type: QueryTypes.SELECT },
  );

  if (!updated) {
    res.status(404).json({ error: "Proyecto no encontrado" });
    return;
  }
  res.json({ project: updated });
};

export const deleteProject: RequestHandler = async (req, res) => {
  const user = getUser(req);
  if (!user) {
    res.status(401).json({ error: "No autenticado" });
    return;
  }

  const { id } = req.params;
  await sequelize.query(
    `DELETE FROM video_projects WHERE id = :id AND seller_id = :sellerId`,
    { replacements: { id, sellerId: user.id } },
  );
  res.json({ ok: true });
};

// ─── Assets ──────────────────────────────────────────────────────────────────

export const uploadAssetImages: RequestHandler = async (req, res) => {
  const user = getUser(req);
  if (!user) {
    res.status(401).json({ error: "No autenticado" });
    return;
  }

  const files = Array.isArray((req as any).files)
    ? ((req as any).files as Express.Multer.File[])
    : [];

  if (files.length === 0) {
    res.status(400).json({ error: "images[] requerido" });
    return;
  }

  await ensureVideoAssetBucket();

  const uploaded: unknown[] = [];
  for (const file of files.slice(0, 6)) {
    if (!IMAGE_MIME_TYPES.has(file.mimetype)) {
      res.status(400).json({ error: "Tipo de imagen no permitido" });
      return;
    }

    const ext = extensionFor(file);
    const stem = safeFileStem(file.originalname);
    const storagePath = `${user.id}/${Date.now()}-${randomUUID()}-${stem}.${ext}`;

    const { error: uploadError } = await supabase.storage
      .from(VIDEO_ASSET_BUCKET)
      .upload(storagePath, file.buffer, {
        contentType: file.mimetype || "image/jpeg",
        upsert: false,
      });

    if (uploadError) {
      throw new Error(`No se pudo subir la imagen: ${uploadError.message}`);
    }

    const { data } = supabase.storage
      .from(VIDEO_ASSET_BUCKET)
      .getPublicUrl(storagePath);

    uploaded.push({
      product_id: null,
      asset_type: "custom_image",
      source_url: data.publicUrl,
      metadata: {
        file_name: file.originalname,
        storage_path: storagePath,
        role: "supporting_reference",
      },
      sort_order: uploaded.length,
    });
  }

  res.status(201).json({ assets: uploaded });
};

export const upsertAssets: RequestHandler = async (req, res) => {
  const user = getUser(req);
  if (!user) {
    res.status(401).json({ error: "No autenticado" });
    return;
  }

  const { id } = req.params;

  const [proj] = await sequelize.query(
    `SELECT id FROM video_projects WHERE id = :id AND seller_id = :sellerId`,
    { replacements: { id, sellerId: user.id }, type: QueryTypes.SELECT },
  );
  if (!proj) {
    res.status(404).json({ error: "Proyecto no encontrado" });
    return;
  }

  const assets = req.body.assets as Array<{
    product_id?: string;
    asset_type?: string;
    source_url: string;
    storage_path?: string;
    metadata?: object;
    sort_order?: number;
  }>;

  if (!Array.isArray(assets) || assets.length === 0) {
    res.status(400).json({ error: "assets[] requerido" });
    return;
  }

  await sequelize.query(`DELETE FROM video_assets WHERE project_id = :id`, {
    replacements: { id },
  });

  const inserted: unknown[] = [];
  for (let i = 0; i < Math.min(assets.length, 6); i++) {
    const a = assets[i];
    const metadata = (a.metadata ?? {}) as Record<string, unknown>;
    const storagePath =
      typeof a.storage_path === "string"
        ? a.storage_path
        : typeof metadata.storage_path === "string"
          ? metadata.storage_path
          : null;
    const [row] = await sequelize.query(
      `INSERT INTO video_assets (project_id, seller_id, product_id, asset_type, source_url, storage_path, metadata, sort_order)
       VALUES (:projectId, :sellerId, :productId, :assetType, :sourceUrl, :storagePath, :metadata::jsonb, :sortOrder)
       RETURNING id, product_id, asset_type, source_url, metadata, sort_order`,
      {
        replacements: {
          projectId: id,
          sellerId: user.id,
          productId: a.product_id ?? null,
          assetType: a.asset_type ?? "product_image",
          sourceUrl: a.source_url,
          storagePath,
          metadata: JSON.stringify(metadata),
          sortOrder: a.sort_order ?? i,
        },
        type: QueryTypes.SELECT,
      },
    );
    inserted.push(row);
  }

  res.json({ assets: inserted });
};

// ─── Generations ─────────────────────────────────────────────────────────────

export const createGeneration: RequestHandler = async (req, res) => {
  const user = getUser(req);
  if (!user) {
    res.status(401).json({ error: "No autenticado" });
    return;
  }

  const { id } = req.params;
  const body = req.body as Record<string, unknown>;

  // ── Validar provider + model ──────────────────────────────────────────────
  const requestedProvider = str(body.provider, 32) ?? "fal";
  const requestedModel = str(body.model, 64) ?? null;

  let provider;
  try {
    provider = getVideoProvider(requestedProvider);
  } catch {
    res
      .status(400)
      .json({ error: `Provider no soportado: "${requestedProvider}"` });
    return;
  }

  const resolvedModel = requestedModel ?? provider.defaultModel;

  try {
    assertAllowedCombination(requestedProvider, resolvedModel);
  } catch {
    res.status(400).json({
      error: `Combinación provider/model no permitida: ${requestedProvider}/${resolvedModel}`,
    });
    return;
  }

  // ── Cargar proyecto ───────────────────────────────────────────────────────
  const [project] = (await sequelize.query(
    `SELECT vp.id, vp.prompt, vp.objective, vp.format, vp.duration_seconds, vp.style_preset,
            ARRAY_AGG(va.source_url ORDER BY va.sort_order) FILTER (WHERE va.source_url IS NOT NULL) AS asset_urls
     FROM video_projects vp
     LEFT JOIN video_assets va ON va.project_id = vp.id
     WHERE vp.id = :id AND vp.seller_id = :sellerId
     GROUP BY vp.id`,
    { replacements: { id, sellerId: user.id }, type: QueryTypes.SELECT },
  )) as any[];

  if (!project) {
    res.status(404).json({ error: "Proyecto no encontrado" });
    return;
  }

  // ── Límite de concurrencia por seller ─────────────────────────────────────
  const [{ count }] = (await sequelize.query(
    `SELECT COUNT(*)::int AS count FROM video_generations
     WHERE seller_id = :sellerId AND status IN ('queued','validating','generating','processing_output')`,
    { replacements: { sellerId: user.id }, type: QueryTypes.SELECT },
  )) as any[];

  if (count >= 2) {
    res.status(429).json({
      error: "Ya tienes generaciones en curso. Espera a que terminen.",
    });
    return;
  }

  const prompt =
    str(body.prompt, 1000) ?? project.prompt ?? "Video promocional de producto";
  const imageUrls: string[] = Array.isArray(project.asset_urls)
    ? project.asset_urls
    : [];
  const costCents = estimateCostCents(
    requestedProvider,
    resolvedModel,
    project.duration_seconds,
  );
  const aiOperation = aiOperationForVideo(requestedProvider, resolvedModel);
  let deductedAiCredits: {
    balanceAfter: number;
    txId: string;
    creditsUsed: number;
  } | null = null;

  if (aiOperation) {
    try {
      deductedAiCredits = await deductAiCredits(
        user.id,
        aiOperation,
        "video_project",
        String(id),
      );
    } catch (err) {
      if (err instanceof InsufficientAiCreditsError) {
        res.status(402).json({
          error:
            "Necesitas más créditos de IA para generar este video. Compra créditos y vuelve automáticamente al proyecto.",
          code: "INSUFFICIENT_CREDITS",
          balance: err.balance,
          required: err.required,
        });
        return;
      }
      throw err;
    }
  }

  // ── Enviar job al provider ────────────────────────────────────────────────
  let providerJobId: string;
  let initialStatus: string = "queued";

  try {
    const result = await provider.generate({
      prompt,
      imageUrls,
      format: project.format,
      durationSeconds: project.duration_seconds,
      stylePreset: project.style_preset ?? undefined,
      model: resolvedModel,
    });
    providerJobId = result.jobId;
    initialStatus = result.status;
  } catch (err: any) {
    const msg: string = err.message ?? "";
    // fal.ai 403 "Exhausted balance" → error de saldo específico
    if (
      msg.includes("403") &&
      (msg.toLowerCase().includes("balance") ||
        msg.toLowerCase().includes("locked"))
    ) {
      if (deductedAiCredits) {
        await refundAiCredits(
          user.id,
          deductedAiCredits.creditsUsed,
          "Reembolso automático: proveedor de video sin saldo",
          "video_project",
          String(id),
        );
      }
      res.status(402).json({
        error:
          "El proveedor de video no tiene saldo disponible. Intenta de nuevo en unos segundos.",
        code: "INSUFFICIENT_CREDITS",
      });
      return;
    }
    if (deductedAiCredits) {
      await refundAiCredits(
        user.id,
        deductedAiCredits.creditsUsed,
        "Reembolso automático: no se pudo iniciar el video",
        "video_project",
        String(id),
      );
    }
    res.status(502).json({
      error: `Error al contactar al proveedor de video. Intenta de nuevo en unos segundos.`,
    });
    return;
  }

  // ── Guardar en DB ─────────────────────────────────────────────────────────
  const [generation] = (await sequelize.query(
    `INSERT INTO video_generations
       (project_id, seller_id, provider, model, provider_job_id, status,
        prompt_snapshot, input_snapshot, cost_estimated_cents)
     VALUES (:projectId, :sellerId, :provider, :model, :jobId, :status,
             :prompt, :inputSnapshot::jsonb, :costCents)
     RETURNING id, status, provider, model, cost_estimated_cents, created_at`,
    {
      replacements: {
        projectId: id,
        sellerId: user.id,
        provider: requestedProvider,
        model: resolvedModel,
        jobId: providerJobId!,
        status: initialStatus,
        prompt,
        inputSnapshot: JSON.stringify({
          objective: project.objective,
          format: project.format,
          duration_seconds: project.duration_seconds,
          style_preset: project.style_preset,
          image_count: imageUrls.length,
          ai_credit_tx_id: deductedAiCredits?.txId ?? null,
          ai_credits_used: deductedAiCredits?.creditsUsed ?? 0,
        }),
        costCents,
      },
      type: QueryTypes.SELECT,
    },
  )) as any[];

  res.status(201).json({ generation });
};

export const getGeneration: RequestHandler = async (req, res) => {
  const user = getUser(req);
  if (!user) {
    res.status(401).json({ error: "No autenticado" });
    return;
  }

  const { generationId } = req.params;
  const [row] = (await sequelize.query(
    `SELECT id, project_id, provider, model, provider_job_id, status,
            prompt_snapshot, input_snapshot, preview_url, output_url, storage_path, file_size_bytes,
            error_code, error_message, cost_estimated_cents, cost_actual_cents,
            started_at, completed_at, created_at
     FROM video_generations
     WHERE id = :generationId AND seller_id = :sellerId`,
    {
      replacements: { generationId, sellerId: user.id },
      type: QueryTypes.SELECT,
    },
  )) as any[];

  if (!row) {
    res.status(404).json({ error: "Generación no encontrada" });
    return;
  }

  // ── Lazy polling ──────────────────────────────────────────────────────────
  const ACTIVE_STATUSES = new Set([
    "queued",
    "validating",
    "generating",
    "processing_output",
  ]);

  // Mock jobs manage their own DB state via advanceJob. If one is still active
  // after 60 s the server must have restarted mid-job — mark it expired so the
  // UI unblocks instead of staying stuck forever.
  if (ACTIVE_STATUSES.has(row.status) && row.provider === "mock") {
    const ageMs = Date.now() - new Date(row.created_at).getTime();
    if (ageMs > 60_000) {
      await sequelize.query(
        `UPDATE video_generations
         SET status = 'expired', error_code = 'SERVER_RESTART',
             error_message = 'El servidor se reinició durante la simulación.'
         WHERE id = :generationId`,
        { replacements: { generationId } },
      );
      row.status = "expired";
      row.error_code = "SERVER_RESTART";
      row.error_message = "El servidor se reinició durante la simulación.";
    }
    return res.json({ generation: row });
  }

  if (
    ACTIVE_STATUSES.has(row.status) &&
    row.provider !== "mock" &&
    row.provider_job_id
  ) {
    try {
      const provider = getVideoProvider(row.provider);
      const jobStatus = await provider.getStatus(row.provider_job_id);

      if (jobStatus.status !== row.status) {
        const sets: string[] = ["status = :newStatus"];
        const replacements: Record<string, unknown> = {
          generationId,
          newStatus: jobStatus.status,
        };

        if (jobStatus.status === "generating")
          sets.push("started_at = COALESCE(started_at, NOW())");
        if (jobStatus.status === "completed") {
          sets.push("completed_at = NOW()");
          sets.push("cost_actual_cents = :actualCost");
          replacements.actualCost = jobStatus.actualCostCents ?? 0;

          let finalOutputUrl = jobStatus.outputUrl ?? null;
          let finalPreviewUrl = jobStatus.previewUrl ?? null;

          // ── Storage pipeline: download → Supabase ─────────────────────────
          if (jobStatus.outputUrl) {
            try {
              const stored = await uploadVideoFromUrl({
                sourceUrl: jobStatus.outputUrl,
                projectId: String(row.project_id),
                generationId: String(generationId),
                userId: user.id,
              });
              finalOutputUrl = stored.publicUrl;
              sets.push(
                "storage_path = :storagePath",
                "file_size_bytes = :fileSizeBytes",
              );
              replacements.storagePath = stored.storagePath;
              replacements.fileSizeBytes = stored.sizeBytes;
            } catch (storageErr: any) {
              // Storage failed — use external URL, mark as completed_external
              console.error(
                `[videoStorage] Upload failed for ${generationId}:`,
                storageErr.message,
              );
              sets.push("error_message = :storageError");
              replacements.storageError = `Storage upload failed: ${storageErr.message}`;
            }
          }

          sets.push("output_url = :outputUrl", "preview_url = :previewUrl");
          replacements.outputUrl = finalOutputUrl;
          replacements.previewUrl = finalPreviewUrl;
        }
        if (jobStatus.status === "failed") {
          sets.push("error_code = :errorCode", "error_message = :errorMessage");
          replacements.errorCode = jobStatus.errorCode ?? "PROVIDER_ERROR";
          replacements.errorMessage =
            jobStatus.errorMessage ?? "Error desconocido";
          const refundOperation = aiOperationForVideo(row.provider, row.model);
          const inputSnapshot =
            typeof row.input_snapshot === "object" && row.input_snapshot
              ? row.input_snapshot
              : {};
          const aiCreditTxId = (inputSnapshot as Record<string, unknown>)
            .ai_credit_tx_id;
          const aiCreditsUsed = Number(
            (inputSnapshot as Record<string, unknown>).ai_credits_used ?? 0,
          );
          if (refundOperation && aiCreditTxId && aiCreditsUsed > 0) {
            await refundAiCredits(
              user.id,
              aiCreditsUsed,
              "Reembolso automático: generación de video fallida",
              "video_generation",
              String(generationId),
            );
          }
        }

        await sequelize.query(
          `UPDATE video_generations SET ${sets.join(", ")} WHERE id = :generationId`,
          { replacements },
        );

        // Devolver estado actualizado
        row.status = jobStatus.status;
        if (replacements.outputUrl) {
          row.output_url = replacements.outputUrl;
          row.preview_url = replacements.previewUrl;
        }
        if (replacements.storagePath) {
          row.storage_path = replacements.storagePath;
        }
        if (jobStatus.errorCode) {
          row.error_code = jobStatus.errorCode;
          row.error_message = jobStatus.errorMessage;
        }
      }
    } catch {
      // No fallar si el provider no responde — devolver estado DB
    }
  }

  res.json({ generation: row });
};

// ─── Credits ─────────────────────────────────────────────────────────────────

export const getCredits: RequestHandler = async (req, res) => {
  const user = getUser(req);
  if (!user) {
    res.status(401).json({ error: "No autenticado" });
    return;
  }
  const balance = await getAiCreditsBalance(user.id);
  res.json({
    balance_ai_credits: balance,
    balance_gtq_cents: 0,
    balance_gtq: "0.00",
  });
};

export const adminAddCredits: RequestHandler = async (req, res) => {
  const { sellerId } = req.params;
  const body = req.body as Record<string, unknown>;
  const amount =
    typeof body.amount_gtq_cents === "number"
      ? Math.round(body.amount_gtq_cents)
      : null;
  if (!amount || amount <= 0) {
    res
      .status(400)
      .json({ error: "amount_gtq_cents debe ser un entero positivo" });
    return;
  }
  const { addCredits: addCreds } =
    await import("../services/videoStudio/videoCredit.service");
  const newBalance = await addCreds(Number(sellerId), amount);
  res.json({
    seller_id: Number(sellerId),
    balance_gtq_cents: newBalance,
    balance_gtq: (newBalance / 100).toFixed(2),
  });
};

export const cancelGeneration: RequestHandler = async (req, res) => {
  const user = getUser(req);
  if (!user) {
    res.status(401).json({ error: "No autenticado" });
    return;
  }

  const { generationId } = req.params;
  await sequelize.query(
    `UPDATE video_generations SET status = 'cancelled'
     WHERE id = :generationId AND seller_id = :sellerId
       AND status IN ('queued','validating')`,
    { replacements: { generationId, sellerId: user.id } },
  );
  res.json({ ok: true });
};

export const deleteGeneration: RequestHandler = async (req, res) => {
  const user = getUser(req);
  if (!user) {
    res.status(401).json({ error: "No autenticado" });
    return;
  }

  const { generationId } = req.params;
  const [generation] = (await sequelize.query(
    `SELECT id, storage_path
     FROM video_generations
     WHERE id = :generationId AND seller_id = :sellerId`,
    {
      replacements: { generationId, sellerId: user.id },
      type: QueryTypes.SELECT,
    },
  )) as Array<{ id: string; storage_path: string | null }>;

  if (!generation) {
    res.status(404).json({ error: "Generación no encontrada" });
    return;
  }

  await sequelize.query(
    `DELETE FROM video_generations
     WHERE id = :generationId AND seller_id = :sellerId`,
    { replacements: { generationId, sellerId: user.id } },
  );

  if (generation.storage_path) {
    const { error } = await supabase.storage
      .from("videos")
      .remove([generation.storage_path]);
    if (error) {
      console.warn(
        `[videoStorage] delete warning for ${generation.storage_path}: ${error.message}`,
      );
    }
  }

  res.json({ ok: true });
};

export const downloadGeneration: RequestHandler = async (req, res) => {
  const user = getUser(req);
  if (!user) {
    res.status(401).json({ error: "No autenticado" });
    return;
  }

  const { generationId } = req.params;
  const [generation] = (await sequelize.query(
    `SELECT id, output_url, storage_path
     FROM video_generations
     WHERE id = :generationId AND seller_id = :sellerId
       AND status = 'completed'`,
    {
      replacements: { generationId, sellerId: user.id },
      type: QueryTypes.SELECT,
    },
  )) as Array<{
    id: string;
    output_url: string | null;
    storage_path: string | null;
  }>;

  if (!generation?.output_url && !generation?.storage_path) {
    res.status(404).json({ error: "Video no disponible para descarga" });
    return;
  }

  let buffer: Buffer;
  let contentType = "video/mp4";
  let ext = "mp4";

  if (generation.storage_path) {
    const { data, error } = await supabase.storage
      .from("videos")
      .download(generation.storage_path);
    if (error || !data) {
      res.status(404).json({ error: "Archivo no encontrado en storage" });
      return;
    }
    buffer = Buffer.from(await data.arrayBuffer());
    contentType = data.type || contentType;
    ext = generation.storage_path.split(".").pop()?.split("?")[0] || ext;
  } else {
    const response = await fetch(generation.output_url!);
    if (!response.ok) {
      res.status(502).json({ error: "No se pudo descargar el archivo origen" });
      return;
    }
    contentType = response.headers.get("content-type") || contentType;
    ext = contentType.includes("webm")
      ? "webm"
      : contentType.includes("image/")
        ? contentType.split("/")[1]
        : "mp4";
    buffer = Buffer.from(await response.arrayBuffer());
  }

  res.setHeader("Content-Type", contentType);
  res.setHeader("Content-Length", String(buffer.byteLength));
  res.setHeader(
    "Content-Disposition",
    `attachment; filename="flowjuyu-video-${generationId}.${ext}"`,
  );
  res.setHeader("Cache-Control", "private, max-age=0, no-store");
  res.status(200).send(buffer);
};

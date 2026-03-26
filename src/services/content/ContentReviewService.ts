// src/services/content/ContentReviewService.ts
//
// Human review actions: approve, edit+approve, reject, publish.
// Every action runs inside a Sequelize transaction to keep variant + item + review
// updates atomic. State machine rules are enforced before any DB write.

import { Transaction } from "sequelize";
import { sequelize } from "../../config/db";
import AiContentItem from "../../models/AiContentItem.model";
import AiContentVariant from "../../models/AiContentVariant.model";
import AiContentReview from "../../models/AiContentReview.model";
import { computeContentHash } from "./ContentGenerationService";
import type { ReviewAction, RejectionReason, VariantStatus } from "../../types/content.types";
import { VARIANT_TRANSITIONS } from "../../types/content.types";

// ─── State machine guard ─────────────────────────────────────────────────────

function assertVariantTransition(
  variant: AiContentVariant,
  to: VariantStatus
): void {
  const allowed = VARIANT_TRANSITIONS[variant.status];
  if (!allowed.includes(to)) {
    throw Object.assign(
      new Error(
        `Invalid variant transition: ${variant.status} → ${to}`
      ),
      { statusCode: 409 }
    );
  }
}

// ─── Internal helpers ────────────────────────────────────────────────────────

/** Re-evaluate item status after a variant changes. */
async function syncItemStatus(
  item: AiContentItem,
  t: Transaction
): Promise<void> {
  const queuedCount = await AiContentVariant.count({
    where: { content_item_id: item.id, status: "queued_for_review" },
    transaction: t,
  });

  if (queuedCount === 0 && item.status === "in_review") {
    await item.update({ status: "pending" }, { transaction: t });
  }
}

// ─── Approve ────────────────────────────────────────────────────────────────

export async function approveVariant(
  variantId: string,
  reviewerId: number
): Promise<{ variant: AiContentVariant; review: AiContentReview }> {
  return sequelize.transaction(async (t: Transaction) => {
    const variant = await AiContentVariant.findByPk(variantId, { transaction: t, lock: true });
    if (!variant) {
      throw Object.assign(new Error("VARIANT_NOT_FOUND"), { statusCode: 404 });
    }

    assertVariantTransition(variant, "approved");
    await variant.update({ status: "approved" }, { transaction: t });

    const review = await AiContentReview.create(
      {
        variant_id:  variantId,
        reviewer_id: reviewerId,
        action:      "approved" as ReviewAction,
        was_edited:  false,
      },
      { transaction: t }
    );

    // Promote the item to 'approved'
    const item = await AiContentItem.findByPk(variant.content_item_id, {
      transaction: t,
      lock: true,
    });
    if (item && ["in_review", "generating"].includes(item.status)) {
      await item.update({ status: "approved" }, { transaction: t });
    }

    return { variant, review };
  });
}

// ─── Edit and Approve ────────────────────────────────────────────────────────

export async function editAndApproveVariant(
  variantId: string,
  reviewerId: number,
  newContentBody: string
): Promise<{ variant: AiContentVariant; review: AiContentReview }> {
  return sequelize.transaction(async (t: Transaction) => {
    const variant = await AiContentVariant.findByPk(variantId, { transaction: t, lock: true });
    if (!variant) {
      throw Object.assign(new Error("VARIANT_NOT_FOUND"), { statusCode: 404 });
    }

    assertVariantTransition(variant, "edited_and_approved");

    const contentBefore = variant.content_body;
    const contentAfter  = newContentBody.trim();
    const editCharDelta = Math.abs(contentAfter.length - contentBefore.length);
    const newHash       = computeContentHash(contentAfter, variant.language, variant.template_id);
    const newWordCount  = contentAfter.split(/\s+/).filter(Boolean).length;

    await variant.update(
      {
        status:       "edited_and_approved",
        content_body: contentAfter,
        content_hash: newHash,
        word_count:   newWordCount,
      },
      { transaction: t }
    );

    const review = await AiContentReview.create(
      {
        variant_id:      variantId,
        reviewer_id:     reviewerId,
        action:          "edited_and_approved" as ReviewAction,
        was_edited:      true,
        content_before:  contentBefore,
        content_after:   contentAfter,
        edit_char_delta: editCharDelta,
      },
      { transaction: t }
    );

    const item = await AiContentItem.findByPk(variant.content_item_id, {
      transaction: t,
      lock: true,
    });
    if (item && ["in_review", "generating"].includes(item.status)) {
      await item.update({ status: "approved" }, { transaction: t });
    }

    return { variant, review };
  });
}

// ─── Reject ─────────────────────────────────────────────────────────────────

export async function rejectVariant(
  variantId: string,
  reviewerId: number,
  rejectionReason: RejectionReason,
  rejectionNote?: string
): Promise<{ variant: AiContentVariant; review: AiContentReview }> {
  return sequelize.transaction(async (t: Transaction) => {
    const variant = await AiContentVariant.findByPk(variantId, { transaction: t, lock: true });
    if (!variant) {
      throw Object.assign(new Error("VARIANT_NOT_FOUND"), { statusCode: 404 });
    }

    assertVariantTransition(variant, "rejected");

    await variant.update(
      {
        status:           "rejected",
        rejection_reason: "admin_rejected",
        rejection_note:   rejectionNote ?? null,
      },
      { transaction: t }
    );

    const review = await AiContentReview.create(
      {
        variant_id:       variantId,
        reviewer_id:      reviewerId,
        action:           "rejected" as ReviewAction,
        was_edited:       false,
        rejection_reason: rejectionReason,
        rejection_note:   rejectionNote ?? null,
      },
      { transaction: t }
    );

    // Re-evaluate item: if no variants remain in queue, reset item to pending
    const item = await AiContentItem.findByPk(variant.content_item_id, {
      transaction: t,
      lock: true,
    });
    if (item) {
      await syncItemStatus(item, t);
    }

    return { variant, review };
  });
}

// ─── Publish ─────────────────────────────────────────────────────────────────
// Minimal publish: updates DB records only.
// No external CMS write, no API call. The frontend reads the published content
// via the product's content endpoint (Phase 3).

export async function publishVariant(
  variantId: string
): Promise<{ variant: AiContentVariant; item: AiContentItem }> {
  return sequelize.transaction(async (t: Transaction) => {
    const variant = await AiContentVariant.findByPk(variantId, { transaction: t, lock: true });
    if (!variant) {
      throw Object.assign(new Error("VARIANT_NOT_FOUND"), { statusCode: 404 });
    }

    assertVariantTransition(variant, "published");

    const item = await AiContentItem.findByPk(variant.content_item_id, {
      transaction: t,
      lock: true,
    });
    if (!item) {
      throw Object.assign(new Error("ITEM_NOT_FOUND"), { statusCode: 404 });
    }

    // Archive the previously published variant for this item, if any
    if (item.published_variant_id && item.published_variant_id !== variantId) {
      await AiContentVariant.update(
        { status: "archived", archived_at: new Date() },
        {
          where:       { id: item.published_variant_id },
          transaction: t,
        }
      );
    }

    const now = new Date();

    await variant.update(
      { status: "published", published_at: now },
      { transaction: t }
    );

    // Atomic update: item status + published_variant_id in one write
    await item.update(
      { status: "published", published_variant_id: variantId },
      { transaction: t }
    );

    return { variant, item };
  });
}

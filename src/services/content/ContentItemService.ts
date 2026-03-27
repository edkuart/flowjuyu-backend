// src/services/content/ContentItemService.ts
//
// Manages the lifecycle of AiContentItem records.
// Single responsibility: item state, cooldown enforcement, and status transitions.

import AiContentItem from "../../models/AiContentItem.model";
import type {
  ContentType,
  SubjectType,
  ItemStatus,
} from "../../types/content.types";
import { ITEM_TRANSITIONS } from "../../types/content.types";

const COOLDOWN_HOURS = 72;

export class ContentItemService {
  /**
   * Find the existing item for a subject+content_type pair, or create it.
   * The DB unique constraint on (subject_type, subject_id, content_type) is
   * the final authority; findOrCreate handles the race-condition safely.
   */
  static async findOrCreate(
    subject_type: SubjectType,
    subject_id: string,
    content_type: ContentType,
    priority = 5
  ): Promise<{ item: AiContentItem; created: boolean }> {
    const [item, created] = await AiContentItem.findOrCreate({
      where: { subject_type, subject_id, content_type },
      defaults: {
        subject_type,
        subject_id,
        content_type,
        priority,
        status: "pending",
      },
    });
    return { item, created };
  }

  /**
   * Assert that generation is allowed to proceed.
   * Throws a typed error with statusCode if not.
   */
  static assertCanGenerate(item: AiContentItem): void {
    if (item.status === "generating") {
      throw Object.assign(new Error("GENERATION_IN_PROGRESS"), {
        statusCode: 409,
      });
    }
    if (item.status === "published") {
      throw Object.assign(new Error("ALREADY_PUBLISHED"), { statusCode: 409 });
    }
    if (item.status === "archived") {
      throw Object.assign(new Error("ITEM_ARCHIVED"), { statusCode: 409 });
    }
    if (
      process.env.NODE_ENV === "production" &&
      item.cooldown_until &&
      item.cooldown_until > new Date()
    ) {
      throw Object.assign(
        new Error(`COOLDOWN_ACTIVE:${item.cooldown_until.toISOString()}`),
        { statusCode: 429 }
      );
    }
  }

  /** Validate and apply a status transition. Throws on invalid jump. */
  static async transitionStatus(
    item: AiContentItem,
    to: ItemStatus
  ): Promise<void> {
    const allowed = ITEM_TRANSITIONS[item.status];
    if (!allowed.includes(to)) {
      throw new Error(
        `Invalid item status transition: ${item.status} → ${to}`
      );
    }
    await item.update({ status: to });
  }

  static async markGenerating(item: AiContentItem): Promise<void> {
    await this.transitionStatus(item, "generating");
  }

  /** Safe: allows self-transition (in_review → in_review) when adding new variants. */
  static async markInReview(item: AiContentItem): Promise<void> {
    if (item.status === "in_review") {
      return; // already there; no-op
    }
    await this.transitionStatus(item, "in_review");
  }

  static async markBlocked(item: AiContentItem): Promise<void> {
    await item.update({ status: "blocked" });
  }

  /**
   * Emergency reset after an unexpected pipeline exception.
   * Bypasses the state machine so the item can be retried immediately.
   * Only called from the pipeline's catch block — never on a normal code path.
   */
  static async markFailed(item: AiContentItem): Promise<void> {
    await item.update({ status: "pending" });
  }

  static async markApproved(item: AiContentItem): Promise<void> {
    await this.transitionStatus(item, "approved");
  }

  /** Set status=published and stamp published_variant_id atomically at caller level. */
  static async markPublished(
    item: AiContentItem,
    variantId: string
  ): Promise<void> {
    await item.update({
      status: "published",
      published_variant_id: variantId,
    });
  }

  /**
   * Stamp the cooldown and increment generation_count after any generation
   * attempt — success or failure.
   */
  static async stampGeneration(item: AiContentItem): Promise<void> {
    const cooldown_until = new Date();
    cooldown_until.setHours(cooldown_until.getHours() + COOLDOWN_HOURS);

    await item.update({
      last_generated_at: new Date(),
      generation_count: item.generation_count + 1,
      cooldown_until,
    });
  }
}

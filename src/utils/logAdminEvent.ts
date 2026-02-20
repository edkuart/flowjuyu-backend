import AdminAuditEvent from "../models/adminAuditEvent.model";

interface LogParams {
  entityType: string;
  entityId: number;
  action: string;
  performedBy: number;
  comment?: string;
  metadata?: any;
}

export async function logAdminEvent({
  entityType,
  entityId,
  action,
  performedBy,
  comment,
  metadata,
}: LogParams) {
  await AdminAuditEvent.create({
    entity_type: entityType,
    entity_id: entityId,
    action,
    performed_by: performedBy,
    comment: comment || null,
    metadata: metadata || null,
  });
}

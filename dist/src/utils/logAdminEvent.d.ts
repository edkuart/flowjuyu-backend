interface LogParams {
    entityType: string;
    entityId: number;
    action: string;
    performedBy: number;
    comment?: string;
    metadata?: any;
}
export declare function logAdminEvent({ entityType, entityId, action, performedBy, comment, metadata, }: LogParams): Promise<void>;
export {};

export declare const logEvent: ({ type, user_id, product_id, seller_id, metadata, }: {
    type: string;
    user_id?: number | null;
    product_id?: string | null;
    seller_id?: number | null;
    metadata?: any;
}) => Promise<void>;

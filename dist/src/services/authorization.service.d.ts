type Action = "create_product" | "activate_product" | "edit_profile" | "view_sensitive_data";
export declare function can(user: any, action: Action): Promise<boolean>;
export {};

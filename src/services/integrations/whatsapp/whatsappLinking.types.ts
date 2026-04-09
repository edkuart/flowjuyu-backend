export type SellerWhatsappLinkStatus = {
  linkedPhone: string | null;
  linkedAt: string | null;
  activeToken: {
    tokenHint: string;
    expiresAt: string;
  } | null;
};

export type GenerateSellerWhatsappLinkingTokenResult = {
  code: string;
  tokenHint: string;
  expiresAt: string;
};

export type ConsumeSellerWhatsappLinkingTokenResult =
  | {
      ok: true;
      sellerUserId: number;
      phoneE164: string;
      nombreComercio: string;
      alreadyLinked: boolean;
    }
  | {
      ok: false;
      reason:
        | "invalid_token"
        | "expired_token"
        | "phone_already_linked"
        | "seller_already_linked_other_phone";
      sellerUserId?: number;
      linkedPhone?: string | null;
      linkedSellerName?: string | null;
    };

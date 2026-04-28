// Server-side source of truth for video credit packages.
// Prices are NEVER read from the client — only the package_id is sent.
export const CREDIT_PACKAGES = {
  starter: {
    id: "starter",
    labelEs: "Starter",
    gtqCents: 2500,       // Q25.00 in credits added to the account
    priceUsdCents: 323,   // $3.23 USD charged to card (Q25 / 7.75 GTQ/USD)
    clips: "~80 clips de 8s",
    badge: null,
  },
  creador: {
    id: "creador",
    labelEs: "Creador",
    gtqCents: 7500,       // Q75.00
    priceUsdCents: 968,   // $9.68 USD
    clips: "~250 clips de 8s",
    badge: "Más popular",
  },
  pro: {
    id: "pro",
    labelEs: "Pro",
    gtqCents: 15000,      // Q150.00
    priceUsdCents: 1935,  // $19.35 USD
    clips: "~500 clips de 8s",
    badge: "Mejor precio",
  },
} as const;

export type CreditPackageId = keyof typeof CREDIT_PACKAGES;

export function isValidPackageId(id: string): id is CreditPackageId {
  return id in CREDIT_PACKAGES;
}

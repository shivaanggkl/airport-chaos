export type PublicStoreCatalogItem = {
  id: string;
  kind: 'aircraft' | 'paint';
  free?: boolean;
  included?: boolean;
  credits?: number;
  firstCredits?: number;
  tokens?: number;
  firstTokens?: number;
  fromCredits?: number;
  usdDisplayPrice?: string;
};

export function publicStoreCatalog(): PublicStoreCatalogItem[];

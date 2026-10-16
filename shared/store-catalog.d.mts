export type PublicStoreCatalogItem = {
  id: string;
  kind: 'aircraft' | 'paint';
  free?: boolean;
  included?: boolean;
  credits?: number;
  tokens?: number;
};

export function publicStoreCatalog(): PublicStoreCatalogItem[];

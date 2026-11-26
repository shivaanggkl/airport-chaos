export type AdvertisingPackageId = 'HUB_SPOTLIGHT' | 'DALLAS_NETWORK';
export type AdvertisingPackage = Readonly<{id:AdvertisingPackageId;interest:'HUB'|'DALLAS';name:string;plannedUsd:number;durationDays:number}>;
export const advertisingPackages: readonly AdvertisingPackage[];
export function advertisingPackage(id: unknown): AdvertisingPackage | undefined;
export const advertisingWaitlistConsent: string;

export const advertisingEmailWaitlistConsent: string;

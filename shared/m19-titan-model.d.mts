import type { TitanVector } from './titan-pose.mjs';
export const m19Model: Readonly<{
    url: string;
    forwardYaw: number;
    neckAimWeight: number;
    legacyYawOffset: number;
    clips: readonly string[];
    lods: readonly string[];
    anchors: Readonly<Record<string, readonly number[]>>;
    bones: Readonly<Record<string, string>>;
}>;
export function m19ModelPoint(point: TitanVector, height?: number): TitanVector;
export function m19LegacyYaw(yaw: number): number;

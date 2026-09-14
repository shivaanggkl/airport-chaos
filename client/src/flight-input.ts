export type FlightAction = 'throttleUp' | 'throttleDown' | 'pitchUp' | 'pitchDown' | 'rollLeft' | 'rollRight' | 'yawLeft' | 'yawRight' | 'boost' | 'fire' | 'aimLeft' | 'aimRight' | 'aimUp' | 'aimDown' | 'stunt';
export const keyboardActionBindings: Readonly<Record<string, FlightAction>> = {
  KeyW: 'throttleUp', KeyS: 'throttleDown',
  KeyA: 'rollLeft', KeyD: 'rollRight',
  KeyQ: 'aimLeft', KeyE: 'aimRight', KeyZ: 'aimUp', KeyC: 'aimDown',
  ArrowUp: 'pitchUp', ArrowDown: 'pitchDown',
  ArrowLeft: 'yawLeft', ArrowRight: 'yawRight',
  ShiftLeft: 'boost', ShiftRight: 'boost', Space: 'fire', KeyX: 'stunt',
};

// Presentation reads the binding, while flight consumes platform-neutral actions.
export function actionKeyLabel(action: FlightAction): string {
  const code = Object.keys(keyboardActionBindings).find((key) => keyboardActionBindings[key] === action) ?? '';
  const symbols: Record<string, string> = { ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→', ShiftLeft: 'SHIFT', Space: 'SPACE' };
  return symbols[code] ?? code.replace('Key', '');
}

export const menuBindings = { map: 'KeyM', menu: 'Tab', restart: 'KeyR' } as const;
export const menuKeyLabel = (action: keyof typeof menuBindings): string => menuBindings[action].replace('Key', '').toUpperCase();
export const controlGroups = [
  { label: 'CORE', rows: [
    { label: 'Faster / Slow', actions: ['throttleUp', 'throttleDown'] },
    { label: 'Up / Down', actions: ['pitchUp', 'pitchDown'] },
    { label: 'Tilt Plane', actions: ['rollLeft', 'rollRight'] },
    { label: 'Turn', actions: ['yawLeft', 'yawRight'] },
    { label: 'Shoot', actions: ['fire'] },
    { label: 'Boost', actions: ['boost'] },
  ] },
  { label: 'ADVANCED', rows: [
    { label: 'Aim Left / Right', actions: ['aimLeft', 'aimRight'] },
    { label: 'Aim Up / Down', actions: ['aimUp', 'aimDown'] },
    { label: 'Barrel Roll', actions: ['stunt', 'rollLeft', 'rollRight'] },
    { label: 'Quick Dodge', actions: ['stunt', 'yawLeft', 'yawRight'] },
  ] },
] satisfies Array<{ label: string; rows: Array<{ label: string; actions: FlightAction[] }> }>;
export const controlKeyLabel = (actions: readonly FlightAction[]): string => actions[0] === 'stunt'
  ? `${actionKeyLabel('stunt')} + ${actions.slice(1).map(actionKeyLabel).join(' / ')}`
  : actions.map(actionKeyLabel).join(' / ');

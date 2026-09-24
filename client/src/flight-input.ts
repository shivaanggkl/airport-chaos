export type FlightAction = 'throttleUp' | 'throttleDown' | 'pitchUp' | 'pitchDown' | 'rollLeft' | 'rollRight' | 'yawLeft' | 'yawRight' | 'boost' | 'fire' | 'aimLeft' | 'aimRight' | 'aimUp' | 'aimDown';
export const keyboardActionBindings: Readonly<Record<string, FlightAction>> = {
  KeyW: 'throttleUp', KeyS: 'throttleDown',
  KeyA: 'rollLeft', KeyD: 'rollRight',
  KeyQ: 'aimUp', KeyE: 'aimDown', KeyZ: 'aimLeft', KeyC: 'aimRight',
  ArrowUp: 'pitchUp', ArrowDown: 'pitchDown',
  ArrowLeft: 'yawLeft', ArrowRight: 'yawRight',
  ShiftLeft: 'boost', ShiftRight: 'boost', Space: 'fire',
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
    { label: 'Faster / Slower', actions: ['throttleUp', 'throttleDown'] },
    { label: 'Altitude Up / Down', actions: ['pitchUp', 'pitchDown'] },
    { label: 'Tilt Left / Right', actions: ['rollLeft', 'rollRight'] },
    { label: 'Turn Left / Right', actions: ['yawLeft', 'yawRight'] },
    { label: 'Fire', actions: ['fire'] },
    { label: 'Boost', actions: ['boost'] },
  ] },
  { label: 'ADVANCED', rows: [
    { label: 'Aim Left / Right', actions: ['aimLeft', 'aimRight'] },
    { label: 'Aim Up / Down', actions: ['aimUp', 'aimDown'] },
  ] },
] satisfies Array<{ label: string; rows: Array<{ label: string; actions: FlightAction[] }> }>;
export const controlKeyLabel = (actions: readonly FlightAction[]): string => actions.map(actionKeyLabel).join(' / ');

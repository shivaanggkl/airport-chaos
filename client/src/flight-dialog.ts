import { registerUiBackLayer, uiBackPriority } from './ui-back-navigation';

export type FlightDialogAction = { label: string; run: () => void; secondary?: boolean };

// Shared entry/gameplay decision surface. One instance also means the
// universal ESC and click-away handler always closes the correct top layer.
const overlay = document.createElement('section');
overlay.className = 'flight-decision-overlay';
overlay.hidden = true;
overlay.setAttribute('role', 'dialog');
overlay.setAttribute('aria-modal', 'true');
const card = document.createElement('div');
card.className = 'flight-decision-card';
const titleElement = document.createElement('h2');
const bodyElement = document.createElement('p');
const actionsElement = document.createElement('div');
actionsElement.className = 'flight-decision-actions';
card.append(titleElement, bodyElement, actionsElement);
overlay.append(card);
document.body.append(overlay);
let onDismiss: (() => void) | undefined;

export function flightDialogOpen(): boolean { return !overlay.hidden; }
export function closeFlightDialog(): void {
  if (overlay.hidden) return;
  overlay.hidden = true;
  const dismiss = onDismiss;
  onDismiss = undefined;
  dismiss?.();
}
export function showFlightDialog(title: string, body: string, actions: readonly FlightDialogAction[], dismiss?: () => void): void {
  titleElement.textContent = title;
  bodyElement.textContent = body;
  actionsElement.replaceChildren();
  onDismiss = dismiss;
  for (const action of actions) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = action.secondary ? 'entry-button entry-button-secondary' : 'entry-button entry-button-primary';
    button.textContent = action.label;
    button.addEventListener('click', () => {
      overlay.hidden = true;
      onDismiss = undefined;
      action.run();
    });
    actionsElement.append(button);
  }
  overlay.hidden = false;
}

registerUiBackLayer({
  id: 'flight-decision', priority: uiBackPriority.blockingModal + 20,
  isActive: flightDialogOpen, close: closeFlightDialog,
  containsTarget: (target) => target instanceof Node && card.contains(target),
});

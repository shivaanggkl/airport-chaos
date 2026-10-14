import { SPONSOR_CONTACT_EMAIL } from './company-contact';
import { registerUiBackLayer, uiBackPriority } from './ui-back-navigation';

export class HubInfoDialog {
  private readonly dialog = document.createElement('dialog');
  private readonly heading = document.createElement('h2');
  private readonly lead = document.createElement('strong');
  private readonly description = document.createElement('p');
  private readonly balance = document.createElement('p');
  private readonly contact = document.createElement('a');
  private readonly copy = document.createElement('button');
  private readonly actionClose = document.createElement('button');
  private readonly status = document.createElement('p');
  private readonly closeButton = document.createElement('button');
  private returnFocus?: HTMLElement;

  constructor() {
    this.dialog.className = 'hub-info-dialog';
    this.dialog.setAttribute('aria-labelledby', 'hub-info-title');
    this.heading.id = 'hub-info-title';
    const panel = document.createElement('section');
    panel.className = 'hub-info-panel';
    const header = document.createElement('header');
    this.closeButton.type = 'button';
    this.closeButton.className = 'hub-info-close';
    this.closeButton.setAttribute('aria-label', 'Close');
    this.closeButton.textContent = '×';
    this.closeButton.addEventListener('click', () => this.close());
    header.append(this.heading, this.closeButton);
    this.balance.className = 'hub-info-balance';
    this.contact.className = 'hub-info-contact';
    this.contact.textContent = 'CONTACT US';
    this.contact.href = `mailto:${SPONSOR_CONTACT_EMAIL}?subject=${encodeURIComponent('Airport Chaos Advertising')}`;
    this.copy.type = 'button';
    this.copy.className = 'hub-info-copy';
    this.copy.textContent = 'COPY EMAIL';
    this.copy.addEventListener('click', () => { void this.copyEmail(); });
    this.actionClose.type = 'button';
    this.actionClose.className = 'hub-info-action-close';
    this.actionClose.textContent = 'CLOSE';
    this.actionClose.addEventListener('click', () => this.close());
    const actions = document.createElement('div');
    actions.className = 'hub-info-actions';
    actions.append(this.contact, this.copy, this.actionClose);
    this.status.className = 'hub-info-status';
    this.status.setAttribute('role', 'status');
    panel.append(header, this.lead, this.description, this.balance, actions, this.status);
    this.dialog.append(panel);
    document.body.append(this.dialog);
    registerUiBackLayer({
      id: 'hub-info-dialog', priority: uiBackPriority.modal,
      isActive: () => this.dialog.open,
      close: () => this.close(),
      containsTarget: target => target instanceof Node && this.dialog.contains(target),
    });
    this.dialog.addEventListener('cancel', event => { event.preventDefault(); this.close(); });
    this.dialog.addEventListener('click', event => { if (event.target === this.dialog) this.close(); });
  }

  openAdvertise(trigger: HTMLElement): void {
    this.heading.textContent = 'ADVERTISE IN AIRPORT CHAOS';
    this.lead.textContent = 'Put your brand in our skies.';
    this.description.textContent = 'Reach players through in-game city banners. Contact us to discuss available placements.';
    this.balance.hidden = true;
    this.contact.hidden = false;
    this.copy.hidden = false;
    this.status.textContent = `If your email app does not open, copy ${SPONSOR_CONTACT_EMAIL}.`;
    this.open(trigger);
  }

  openSkyTokens(balance: number, trigger: HTMLElement): void {
    this.heading.textContent = 'Sky Tokens';
    this.lead.textContent = '';
    this.description.textContent = 'Sky Token purchases are coming soon.';
    this.balance.textContent = `Your balance: ${balance.toLocaleString()} Sky Tokens`;
    this.balance.hidden = false;
    this.contact.hidden = true;
    this.copy.hidden = true;
    this.status.textContent = '';
    this.open(trigger);
  }

  openFriends(trigger: HTMLElement): void {
    this.heading.textContent = 'Friends — Coming soon';
    this.lead.textContent = '';
    this.description.textContent = 'Add friends and fly together in Free Fly.';
    this.balance.hidden = true;
    this.contact.hidden = true;
    this.copy.hidden = true;
    this.status.textContent = '';
    this.open(trigger);
  }

  close(): void {
    if (!this.dialog.open) return;
    this.dialog.close();
    this.returnFocus?.focus();
    this.returnFocus = undefined;
  }

  private open(trigger: HTMLElement): void {
    this.returnFocus = trigger;
    if (!this.dialog.open) this.dialog.showModal();
    this.closeButton.focus();
  }

  private async copyEmail(): Promise<void> {
    try {
      if (!navigator.clipboard?.writeText) throw new Error('Clipboard API unavailable');
      await navigator.clipboard.writeText(SPONSOR_CONTACT_EMAIL);
    } catch {
      const input = document.createElement('textarea');
      input.value = SPONSOR_CONTACT_EMAIL;
      input.setAttribute('aria-hidden', 'true');
      input.style.cssText = 'position:absolute;left:-9999px';
      this.dialog.append(input);
      input.select();
      const copied = document.execCommand('copy');
      input.remove();
      if (!copied) {
        this.status.textContent = `Copy unavailable. Email us at ${SPONSOR_CONTACT_EMAIL}.`;
        this.copy.focus();
        return;
      }
    }
    this.status.textContent = `${SPONSOR_CONTACT_EMAIL} copied.`;
    this.copy.focus();
  }
}

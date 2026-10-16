import { flightDialogOpen, showFlightDialog } from './flight-dialog';

export function confirmCatalogPurchase(item: string, currency: 'CREDITS' | 'SKY_TOKENS', price: number, balance: number, confirm: () => void): void {
  if (flightDialogOpen()) return;
  const unit = currency === 'CREDITS' ? 'Credits' : 'Sky Tokens';
  showFlightDialog('CONFIRM UNLOCK', `${item}\n${price.toLocaleString()} ${unit}\nBalance after purchase: ${(balance - price).toLocaleString()} ${unit}`, [
    { label: 'CANCEL', secondary: true, run: () => undefined },
    { label: `UNLOCK · ${price.toLocaleString()} ${unit}`, run: confirm },
  ]);
}

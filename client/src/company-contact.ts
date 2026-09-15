import { legalConfig } from '../../shared/legal-config.mjs';

// Public sponsorship contact shared by Help and the in-game invitation.
export const SPONSOR_CONTACT_EMAIL = legalConfig.supportEmail;

export const companyContact = {
  companyName: legalConfig.studioName,
  website: legalConfig.gameUrl.replace('fly.', ''),
  websiteLabel: 'VadenSoftware.com',
  contactEmail: SPONSOR_CONTACT_EMAIL,
} as const;

export const sponsorLocations = 'Buildings • Airports • Rings • Events • Aircraft • Sky Ads';

export function contactLinks(): string {
  const website = `<a href="${companyContact.website}" target="_blank" rel="noopener noreferrer">${companyContact.websiteLabel}</a>`;
  const email = `<a href="mailto:${companyContact.contactEmail}">${companyContact.contactEmail}</a>`;
  return `<div class="company-contact-links"><span>Website ${website}</span><span>Want to advertise in Airport Chaos? Email ${email}</span></div>`;
}

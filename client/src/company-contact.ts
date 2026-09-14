// Public company details shared by Help and the in-game sponsor invitation.
// Set the email only after the owner confirms the official public address.
export const VADEN_CONTACT_EMAIL = '';

export const companyContact = {
  companyName: 'Vaden Software',
  website: 'https://vadensoftware.com',
  websiteLabel: 'vadensoftware.com',
  contactEmail: VADEN_CONTACT_EMAIL,
} as const;

export const sponsorLocations = 'Buildings • Airports • Rings • Events • Aircraft • Sky Ads';

export function contactLinks(): string {
  const website = `<a href="${companyContact.website}" target="_blank" rel="noopener noreferrer">${companyContact.websiteLabel}</a>`;
  const email = companyContact.contactEmail
    ? `<a href="mailto:${companyContact.contactEmail}">${companyContact.contactEmail}</a>`
    : '<span>Coming soon</span>';
  return `<div class="company-contact-links"><span>Website ${website}</span><span>Email ${email}</span></div>`;
}

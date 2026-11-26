import './advertise-page.css';
import {createContextPageTitle} from './context-page-shell';
import { getSponsorCatalog, sponsorshipApi, type PublicSponsor } from './sponsorship-catalog';
import { recordSponsorMeasurement, setSponsorMeasurementCatalog } from './sponsorship-measurement';

export type BusinessRoute = 'advertise' | 'sponsors' | 'details';
type Interest = 'HUB' | 'DALLAS' | 'CITY_PARTNER' | 'UNSURE';
type Options = { route: BusinessRoute; sponsorId?: string; detailIntentSource?: 'HUB'; onNavigate: (route: BusinessRoute, sponsorId?: string) => void; onClose: () => void; embeddedHeader?: boolean; onRouteChange?: (route: BusinessRoute) => void };
const email = 'support@vadensoftware.com';
const apiBase = import.meta.env.DEV ? 'http://localhost:8091' :
  (window.location.protocol === 'capacitor:' || window.location.protocol === 'file:')
    ? (import.meta.env.VITE_NATIVE_BACKEND_ORIGIN || window.location.origin)
    : window.location.origin;
const api = (path: string): string => new URL(path, apiBase).toString();

export function mountAdvertiseExperience(root: HTMLElement, options: Options): { setRoute: (route: BusinessRoute, sponsorId?: string) => void; destroy: () => void } {
  const originalTitle = document.title;
  root.classList.add('advertise-app');
  root.innerHTML = `
    <header class="adp-topbar" ${options.embeddedHeader ? 'hidden' : ''}>
      <button class="adp-back" type="button" data-back aria-label="Go back"></button>
      <div data-page-title></div>
      <a class="adp-brand" href="/" aria-label="Airport Chaos home">AIRPORT CHAOS</a>
    </header>
    <main class="adp-main" data-advertise-view>
      <section class="adp-hero adp-panel" aria-labelledby="adp-title">
        <div class="adp-hero-copy"><h1 id="adp-title">ADVERTISE IN AIRPORT CHAOS</h1>
          <p>Put your brand where players fly.</p>
          <button class="adp-button context-action context-action--gold" type="button" data-to-form>REQUEST SPONSORSHIP</button>
        </div><img class="adp-hero-image" src="/media/advertise/dfw-terminal.jpg" alt="Real Airport Chaos gameplay near Dallas DFW Airport" width="1280" height="720" fetchpriority="high" />
      </section>
      <section id="opportunities" class="adp-section" aria-labelledby="adp-opportunities-title">
        <h2 id="adp-opportunities-title">ADVERTISING OPPORTUNITIES</h2>
        <p class="adp-availability">Inquiry opportunities only. Placements are subject to review and availability.</p>
        <div class="adp-cards">
          <article class="adp-card adp-panel"><img src="/media/advertise/hub.jpg" alt="The Airport Chaos Pilot Hub" loading="lazy" width="1280" height="720" /><div><h3>HUB SPOTLIGHT</h3><p>Show your brand on the Airport Chaos Pilot Hub.</p><button class="adp-button context-action context-action--gold" type="button" data-interest="HUB" aria-label="Inquire about Hub Spotlight">INQUIRE</button></div></article>
          <article class="adp-card adp-panel"><img src="/media/advertise/love-field.jpg" alt="Real Dallas gameplay near Love Field" loading="lazy" width="1280" height="720" /><div><h3>DALLAS ADVERTISING</h3><p>Feature your brand at selected locations in Dallas.</p><button class="adp-button context-action context-action--gold" type="button" data-interest="DALLAS" aria-label="Inquire about Dallas Advertising">INQUIRE</button></div></article>
          <article class="adp-card adp-panel"><div class="adp-combo"><img src="/media/advertise/hub.jpg" alt="Pilot Hub partnership opportunity" loading="lazy" width="1280" height="720" /><img src="/media/advertise/dfw-terminal.jpg" alt="Dallas city partnership opportunity" loading="lazy" width="1280" height="720" /></div><div><h3>CITY PARTNER</h3><p>Explore a custom partnership across the Hub and city.</p><button class="adp-button context-action context-action--gold" type="button" data-interest="CITY_PARTNER" aria-label="Inquire about City Partner">INQUIRE</button></div></article>
        </div>
      </section>
      <section class="adp-section" aria-labelledby="adp-how-title"><h2 id="adp-how-title">HOW IT WORKS</h2>
        <ol class="adp-steps">
          <li class="adp-panel"><h3>CHOOSE</h3><p>Select an advertising option.</p></li>
          <li class="adp-panel"><h3>CONTACT</h3><p>Send your business details.</p></li>
          <li class="adp-panel"><h3>REVIEW</h3><p>We review your request and available placements.</p></li>
          <li class="adp-panel"><h3>LAUNCH</h3><p>Your advertisement goes live after agreement and approval.</p></li>
        </ol>
      </section>
      <section id="request-sponsorship" class="adp-section adp-inquiry adp-panel" aria-labelledby="adp-inquiry-title">
        <h2 id="adp-inquiry-title" tabindex="-1">REQUEST SPONSORSHIP</h2>
        <p>Tell us about your business and the advertising opportunities you’re interested in.</p>
        <form data-form novalidate><div class="adp-form-grid">
          <label>Company Name <span aria-hidden="true">*</span><input name="companyName" autocomplete="organization" required minlength="2" maxlength="100" /></label>
          <label>Contact Name <small>Optional</small><input name="contactName" autocomplete="name" maxlength="100" /></label>
          <label>Work Email <span aria-hidden="true">*</span><input name="workEmail" type="email" autocomplete="email" required maxlength="254" /></label>
          <label>Website <small>Optional · HTTPS only</small><input name="website" type="url" inputmode="url" maxlength="300" placeholder="https://example.com" /></label>
          <label class="adp-wide">Advertising Interest <span aria-hidden="true">*</span><select name="interest" required><option value="HUB">Hub Spotlight</option><option value="DALLAS">Dallas Advertising</option><option value="CITY_PARTNER">City Partner</option><option value="UNSURE" selected>Not Sure Yet</option></select></label>
          <label class="adp-wide">Message <span aria-hidden="true">*</span><textarea name="message" required minlength="10" maxlength="1000" rows="4" placeholder="Tell us about your business and what you have in mind."></textarea></label></div>
          <p class="adp-privacy-note">We use your business details to review and respond to this inquiry. <a href="/privacy">Privacy Notice</a></p>
          <p class="adp-form-status" role="status" aria-live="polite" data-status>Checking online inquiry availability…</p>
          <button class="adp-button context-action context-action--gold adp-submit" type="submit" disabled data-submit>REQUEST SPONSORSHIP</button><button class="adp-retry" type="button" data-retry hidden>TRY AGAIN</button>
        </form>
        <div class="adp-fallback"><a class="adp-button context-action context-action--gold" href="mailto:${email}?subject=Airport%20Chaos%20Sponsorship">EMAIL US</a><button type="button" data-copy>COPY EMAIL</button></div>
        <aside class="adp-sponsors-teaser" aria-labelledby="adp-sponsors-title" data-approved-sponsors hidden><h3 id="adp-sponsors-title">SPONSORS</h3><div data-approved-list></div><button class="adp-button context-action context-action--gold" type="button" data-sponsors>VIEW OUR SPONSORS</button></aside>
      </section>
      <footer class="adp-footer"><nav aria-label="Business page links"><a href="/privacy">Privacy Notice</a><a href="/terms">Terms</a><a href="mailto:${email}?subject=Airport%20Chaos%20Sponsorship">Contact Us</a></nav><small>© Airport Chaos · Vaden Software</small></footer>
    </main>
    <main class="adp-directory" data-sponsors-view hidden><section class="adp-directory-panel"><span class="adp-eyebrow">AIRPORT CHAOS PARTNERS</span><h1>OUR SPONSORS</h1><div data-sponsor-list><p>Sponsors will appear here soon.</p></div><button class="adp-button context-action context-action--gold" type="button" data-become>BECOME A SPONSOR</button></section></main>
    <main class="adp-directory" data-details-view hidden><section class="adp-directory-panel adp-sponsor-details"><span class="adp-eyebrow">SPONSORED</span><img data-detail-logo alt="" hidden /><h1 data-detail-name>Checking sponsor…</h1><p data-detail-description></p><a class="adp-button context-action context-action--blue" data-detail-website hidden target="_blank" rel="noopener noreferrer">VISIT WEBSITE</a><button class="adp-button context-action context-action--blue" type="button" data-report-toggle hidden>REPORT SPONSOR AD</button><form data-report-form hidden><label>Reason<select name="reason" required><option value="INAPPROPRIATE">Inappropriate content</option><option value="MISLEADING">Misleading advertisement</option><option value="OFFENSIVE">Offensive content</option><option value="SUSPICIOUS_WEBSITE">Broken or suspicious website</option><option value="OTHER">Other concern</option></select></label><label>Optional details<textarea name="description" maxlength="300" rows="3"></textarea></label><button class="adp-button context-action context-action--gold" type="submit">SEND REPORT</button><p data-report-status role="status" aria-live="polite"></p></form><button class="adp-button context-action context-action--blue" type="button" data-detail-back>CLOSE DETAILS</button></section></main>`;

  root.dataset.header = options.embeddedHeader ? 'shared' : 'public';
  const pageTitle = createContextPageTitle('ADVERTISE', 2);
  root.querySelector('[data-page-title]')!.append(pageTitle);
  const approvedSponsors = root.querySelector<HTMLElement>('[data-approved-sponsors]')!;
  const approvedList = root.querySelector<HTMLElement>('[data-approved-list]')!;
  const advertiseView = root.querySelector<HTMLElement>('[data-advertise-view]')!;
  const sponsorsView = root.querySelector<HTMLElement>('[data-sponsors-view]')!;
  const detailsView = root.querySelector<HTMLElement>('[data-details-view]')!;
  const list = root.querySelector<HTMLElement>('[data-sponsor-list]')!;
  const detailLogo = root.querySelector<HTMLImageElement>('[data-detail-logo]')!;
  const detailName = root.querySelector<HTMLElement>('[data-detail-name]')!;
  const detailDescription = root.querySelector<HTMLElement>('[data-detail-description]')!;
  const detailWebsite = root.querySelector<HTMLAnchorElement>('[data-detail-website]')!;
  const reportToggle = root.querySelector<HTMLButtonElement>('[data-report-toggle]')!;
  const reportForm = root.querySelector<HTMLFormElement>('[data-report-form]')!;
  const reportStatus = root.querySelector<HTMLElement>('[data-report-status]')!;
  const form = root.querySelector<HTMLFormElement>('[data-form]')!;
  const status = root.querySelector<HTMLElement>('[data-status]')!;
  const submit = root.querySelector<HTMLButtonElement>('[data-submit]')!;
  const retry = root.querySelector<HTMLButtonElement>('[data-retry]')!;
  const interest = form.elements.namedItem('interest') as HTMLSelectElement;
  let route = options.route;
  let selectedSponsor: PublicSponsor | undefined;
  let detailReturnSponsorId: string | undefined;
  let pendingDetailIntent: 'HUB' | 'DIRECTORY' | undefined = options.detailIntentSource;
  let routeGeneration = 0;
  let validityTimer: ReturnType<typeof setTimeout> | undefined;
  let activeSponsorId = options.sponsorId;
  let available = false;
  let sending = false;
  const setStatus = (message: string, state = 'ready') => { status.textContent = message; status.dataset.state = state; retry.hidden = state !== 'error' || !available; };
  const toForm = (selected?: Interest) => {
    if (route !== 'advertise') { options.onNavigate('advertise'); route = 'advertise'; setRoute('advertise'); }
    if (selected) interest.value = selected;
    root.querySelector('#request-sponsorship')?.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
    root.querySelector<HTMLElement>('#adp-inquiry-title')?.focus({ preventScroll: true });
  };
  const showApprovedSponsors = async (generation: number) => {
    approvedSponsors.hidden = true;
    approvedList.replaceChildren();
    const catalog = await getSponsorCatalog(true);
    if (generation !== routeGeneration || route !== 'advertise') return;
    setSponsorMeasurementCatalog(catalog);
    if (!catalog.sponsors.length) return;
    for (const sponsor of catalog.sponsors) {
      const button = document.createElement('button');
      button.type = 'button'; button.textContent = sponsor.name;
      button.addEventListener('click', () => { pendingDetailIntent = 'DIRECTORY'; options.onNavigate('details', sponsor.advertiserId); });
      approvedList.append(button);
    }
    approvedSponsors.hidden = false;
    validityTimer = setTimeout(() => { approvedSponsors.hidden = true; approvedList.replaceChildren(); }, catalog.maxAgeMs);
  };
  const showDirectory = async (generation: number) => {
    const catalog = await getSponsorCatalog(true);
    if (generation !== routeGeneration || route !== 'sponsors') return;
    setSponsorMeasurementCatalog(catalog);
    list.replaceChildren();
    if (!catalog.sponsors.length) { const p = document.createElement('p'); p.textContent = 'Sponsors will appear here soon.'; list.append(p); return; }
    for (const sponsor of [...catalog.sponsors].sort((a, b) => a.name.localeCompare(b.name))) {
      const card = document.createElement('article'); card.className = 'adp-sponsor-card';
      const image = document.createElement('img'); image.src = sponsorshipApi(sponsor.logoUrl); image.alt = '';
      image.onerror = () => { card.remove(); if (!list.children.length) { const p = document.createElement('p'); p.textContent = 'Sponsors will appear here soon.'; list.append(p); } };
      const body = document.createElement('div');
      const label = document.createElement('small'); label.textContent = 'SPONSORED';
      const name = document.createElement('h2'); name.textContent = sponsor.name;
      const description = document.createElement('p'); description.textContent = sponsor.description;
      const button = document.createElement('button'); button.type = 'button'; button.className = 'adp-button context-action context-action--blue'; button.textContent = 'VIEW DETAILS';
      button.dataset.sponsorId = sponsor.advertiserId;
      button.addEventListener('click', () => { detailReturnSponsorId = sponsor.advertiserId; pendingDetailIntent = 'DIRECTORY'; options.onNavigate('details', sponsor.advertiserId); });
      body.append(label, name, description, button); card.append(image, body); list.append(card);
    }
    if (detailReturnSponsorId) {
      list.querySelector<HTMLButtonElement>(`[data-sponsor-id="${detailReturnSponsorId}"]`)?.focus();
      detailReturnSponsorId = undefined;
    }
    validityTimer = setTimeout(() => { if (route === 'sponsors') { list.replaceChildren(); const p = document.createElement('p'); p.textContent = 'Sponsors will appear here soon.'; list.append(p); } }, catalog.maxAgeMs);
  };
  const showDetails = async (sponsorId: string | undefined, generation: number) => {
    selectedSponsor = undefined;
    detailLogo.hidden = true; detailWebsite.hidden = true; detailWebsite.removeAttribute('href'); reportToggle.hidden = true; reportForm.hidden = true;
    detailName.textContent = 'Checking sponsor…'; detailDescription.textContent = ''; reportStatus.textContent = '';
    const catalog = await getSponsorCatalog(true);
    if (generation !== routeGeneration || route !== 'details') return;
    setSponsorMeasurementCatalog(catalog);
    const sponsor = catalog.sponsors.find(item => item.advertiserId === sponsorId) ?? (catalog.hub?.advertiserId === sponsorId ? catalog.hub : undefined);
    if (!sponsor) { detailName.textContent = 'Sponsor unavailable'; detailDescription.textContent = 'There is no active sponsor to show.'; return; }
    selectedSponsor = sponsor;
    if (pendingDetailIntent) {
      const source = pendingDetailIntent; pendingDetailIntent = undefined;
      recordSponsorMeasurement({ type: 'SPONSOR_DETAILS_OPEN', campaignId: sponsor.campaignId, creativeId: sponsor.creativeId,
        placementId: source === 'HUB' ? 'global-hub-spotlight' : 'global-sponsors-directory', cityId: 'global', source });
    }
    detailLogo.src = sponsorshipApi(sponsor.logoUrl); detailLogo.hidden = false;
    detailLogo.onerror = () => { selectedSponsor = undefined; detailLogo.hidden = true; detailWebsite.hidden = true; detailWebsite.removeAttribute('href'); reportToggle.hidden = true; reportForm.hidden = true; detailName.textContent = 'Sponsor unavailable'; detailDescription.textContent = 'This sponsorship is no longer available.'; };
    detailName.textContent = sponsor.name; detailDescription.textContent = sponsor.description || sponsor.tagline || '';
    if (sponsor.website) { detailWebsite.href = sponsor.website; detailWebsite.hidden = false; }
    reportToggle.hidden = false;
    validityTimer = setTimeout(() => { if (route === 'details') {
      selectedSponsor = undefined; detailLogo.hidden = true; detailWebsite.hidden = true; detailWebsite.removeAttribute('href'); reportToggle.hidden = true; reportForm.hidden = true;
      detailName.textContent = 'Sponsor unavailable'; detailDescription.textContent = 'This sponsorship is no longer available.';
    } }, catalog.maxAgeMs);
  };
  const setRoute = (next: BusinessRoute, sponsorId?: string) => {
    route = next;
    activeSponsorId = sponsorId;
    if (validityTimer) clearTimeout(validityTimer);
    const generation = ++routeGeneration;
    advertiseView.hidden = next !== 'advertise';
    sponsorsView.hidden = next !== 'sponsors';
    detailsView.hidden = next !== 'details';
    pageTitle.textContent = next === 'sponsors' ? 'SPONSORS' : next === 'details' ? 'SPONSOR DETAILS' : 'ADVERTISE';
    options.onRouteChange?.(next);
    document.title = next === 'sponsors' ? 'Our Sponsors — Airport Chaos' : next === 'details' ? 'Sponsor Details — Airport Chaos' : 'Advertise in Airport Chaos';
    root.scrollTop = 0;
    window.scrollTo(0, 0);
    if (next === 'advertise') void showApprovedSponsors(generation);
    if (next === 'sponsors') void showDirectory(generation);
    if (next === 'details') void showDetails(sponsorId, generation);
  };
  root.querySelectorAll<HTMLElement>('[data-to-form]').forEach(button => button.addEventListener('click', () => toForm()));
  root.querySelectorAll<HTMLButtonElement>('[data-interest]').forEach(button => button.addEventListener('click', () => toForm(button.dataset.interest as Interest)));
  root.querySelector<HTMLElement>('[data-sponsors]')!.addEventListener('click', () => options.onNavigate('sponsors'));
  root.querySelector<HTMLElement>('[data-become]')!.addEventListener('click', () => toForm());
  root.querySelector<HTMLElement>('[data-detail-back]')!.addEventListener('click', () => options.onClose());
  reportToggle.addEventListener('click', () => { reportForm.hidden = false; reportForm.querySelector<HTMLSelectElement>('select')?.focus(); });
  detailWebsite.addEventListener('click', () => {
    if (!selectedSponsor?.website || detailWebsite.hidden) return;
    const source = detailReturnSponsorId ? 'DIRECTORY' : 'HUB';
    recordSponsorMeasurement({ type: 'SPONSOR_WEBSITE_ACTION', campaignId: selectedSponsor.campaignId,
      creativeId: selectedSponsor.creativeId, placementId: source === 'HUB' ? 'global-hub-spotlight' : 'global-sponsors-directory', cityId: 'global', source });
  });
  reportForm.addEventListener('submit', async event => {
    event.preventDefault();
    if (!selectedSponsor || !reportForm.checkValidity()) return;
    const button = reportForm.querySelector<HTMLButtonElement>('button[type=submit]')!;
    button.disabled = true; reportStatus.textContent = 'Sending report…';
    const fields = new FormData(reportForm);
    try {
      const response = await fetch(sponsorshipApi('/api/sponsorship/reports'), { method: 'POST', credentials: 'omit', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ campaignId: selectedSponsor.campaignId, creativeId: selectedSponsor.creativeId, reason: fields.get('reason'), description: fields.get('description') }), signal: AbortSignal.timeout(10_000) });
      if (!response.ok || (await response.json() as { status?: string }).status !== 'RECEIVED') throw new Error('Report not confirmed');
      reportStatus.textContent = 'Report received. Thank you for helping keep Airport Chaos safe.'; reportForm.reset();
    } catch { reportStatus.textContent = 'Report could not be sent. Please try again or contact support@vadensoftware.com.'; }
    finally { button.disabled = false; }
  });
  root.querySelector<HTMLElement>('[data-back]')!.addEventListener('click', () => options.onClose());
  const onForeground = () => {
    if (document.hidden) return;
    if (route !== 'advertise') { setRoute(route, activeSponsorId); return; }
    if (validityTimer) clearTimeout(validityTimer);
    void showApprovedSponsors(++routeGeneration);
  };
  document.addEventListener('visibilitychange', onForeground);
  retry.addEventListener('click', () => form.requestSubmit());
  root.querySelector<HTMLAnchorElement>('.adp-brand')!.addEventListener('click', event => {
    if (!root.classList.contains('advertise-overlay')) return;
    event.preventDefault(); options.onClose();
  });
  root.querySelectorAll<HTMLButtonElement>('[data-copy]').forEach(button => button.addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(email); setStatus('Email copied to clipboard.'); }
    catch {
      const fallback = document.createElement('textarea');
      fallback.value = email; fallback.style.position = 'fixed'; fallback.style.opacity = '0';
      document.body.append(fallback); fallback.select();
      const copied = document.execCommand('copy'); fallback.remove();
      setStatus(copied ? 'Email copied to clipboard.' : `Please email ${email}.`, copied ? 'ready' : 'error');
    }
  }));

  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (sending || !available) return;
    const fields = new FormData(form);
    const website = String(fields.get('website') ?? '').trim();
    if (!form.checkValidity() || (website && !website.startsWith('https://'))) {
      setStatus('Please check the required fields and use an HTTPS website address.', 'error');
      form.reportValidity(); return;
    }
    sending = true; submit.disabled = true; submit.textContent = 'SENDING…'; setStatus('Submitting your request…', 'submitting');
    const body = JSON.stringify(Object.fromEntries(fields.entries()));
    try {
      const response = await fetch(api('/api/sponsorship/inquiries'), { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body, signal: AbortSignal.timeout(12_000) });
      if (response.status === 201) {
        const result = await response.json() as { requestId?: string; status?: string };
        if (result.status !== 'RECEIVED' || !result.requestId) throw new Error('Unconfirmed inquiry response');
        setStatus('Request received. Our team will review it and contact you by email.', 'success'); form.reset();
      }
      else if (response.status === 429) setStatus('Too many requests right now. Please try later or email us.', 'rate-limited');
      else if (response.status === 503) { available = false; setStatus('Online submissions are temporarily unavailable. Please email us.', 'error'); }
      else setStatus('Your request was not received. Please check the form and try again.', 'error');
    } catch { setStatus('Your request was not received. Please try again or email us.', 'error'); }
    finally { sending = false; submit.disabled = !available; submit.textContent = 'REQUEST SPONSORSHIP'; }
  });

  void fetch(api('/api/sponsorship/inquiries'), { credentials: 'include' })
    .then(async response => response.ok ? (await response.json() as { available?: boolean }).available === true : false)
    .then(enabled => { available = enabled; submit.disabled = !enabled; setStatus(enabled ? 'All fields marked * are required.' : 'Online submissions are temporarily unavailable. Please email us.', enabled ? 'ready' : 'error'); })
    .catch(() => setStatus('Online submissions are temporarily unavailable. Please email us.', 'error'));
  setRoute(route, options.sponsorId);
  return { setRoute, destroy: () => { if (validityTimer) clearTimeout(validityTimer); document.removeEventListener('visibilitychange', onForeground); routeGeneration += 1; document.title = originalTitle; root.replaceChildren(); delete root.dataset.header; root.classList.remove('advertise-app'); } };
}

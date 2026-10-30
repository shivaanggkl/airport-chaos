import { mountAdvertiseExperience, type BusinessRoute } from './advertise-page';

const root = document.querySelector<HTMLElement>('#advertise-root')!;
const route = (): BusinessRoute => /^\/sponsors\/[0-9a-f-]{36}$/.test(window.location.pathname) ? 'details' : window.location.pathname === '/sponsors' ? 'sponsors' : 'advertise';
const sponsorId = (): string | undefined => route() === 'details' ? window.location.pathname.split('/')[2] : undefined;
const page = mountAdvertiseExperience(root, {
  route: route(), sponsorId: sponsorId(),
  onNavigate: (next, id) => { window.history.pushState({ airportChaosBusiness: next, sponsorId: id }, '', next === 'details' ? `/sponsors/${id}` : `/${next}`); page.setRoute(next, id); },
  onClose: () => { if (route() === 'details' && window.history.state?.airportChaosBusiness !== 'details') window.location.assign('/sponsors');
    else if (route() !== 'advertise') window.history.back(); else window.location.assign('/'); },
});
window.addEventListener('popstate', () => page.setRoute(route(), sponsorId()));

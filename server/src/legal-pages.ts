import { legalConfig } from '../../shared/legal-config.mjs';
import { firehawkProduct } from '../../shared/aircraft-economy.mjs';

type PolicyKey = keyof typeof legalConfig.policyRoutes;

const support = `<a href="mailto:${legalConfig.supportEmail}">${legalConfig.supportEmail}</a>`;
const sections: Record<PolicyKey, { title: string; updated: string; content: string }> = {
  terms: {
    title: 'Terms of Use', updated: 'September 14, 2026',
    content: `<h2>Using Airport Chaos</h2><p>${legalConfig.productName} is a browser-based game operated by ${legalConfig.legalEntityName}. ${legalConfig.publicBrand} is a product/brand operated by ${legalConfig.legalEntityName}. Gameplay is free, with optional paid digital content. You must be legally able to make online purchases where you live, or have permission from a parent or guardian.</p>
      <h2>Digital content</h2><p>A Firehawk purchase grants a permanent digital entitlement to the associated player profile. Keep your purchase recovery code so Support can help recover access. Credits and Score are game values only: they have no cash value and cannot be redeemed or transferred for money.</p>
      <h2>Fair play</h2><p>Do not cheat, exploit bugs, disrupt the service, or abuse other players. Access or features may be restricted when reasonably necessary to protect players, purchases, or the game.</p>
      <h2>Service changes</h2><p>Aircraft, missions, balance, cities, and other features may change as the game develops. Continuous, error-free, or uninterrupted availability is not guaranteed. The game and digital content are provided to the extent permitted by applicable law, without promises beyond those expressly stated here.</p>
      <h2>Third-party services</h2><p>Purchases use Stripe Checkout and are also subject to Stripe’s applicable terms and privacy practices. Nothing here limits rights that cannot legally be limited.</p>
      <h2>Questions</h2><p>For support, contact ${support}.</p>`,
  },
  privacy: {
    title: 'Privacy Notice', updated: 'September 14, 2026',
    content: `<h2>Information used by the game</h2><p>Airport Chaos processes an anonymous pilot identifier, a live session identifier, gameplay and progression statistics, first-party analytics events, and an authentication cookie used to reconnect you to your player profile. Normal game accounts do not use or store raw passwords.</p>
      <h2>Purchases and support</h2><p>For purchases and support, we may store a purchase reference, recovery information, entitlement status, and the customer email Stripe provides. Payment card details are entered with and handled by Stripe; Airport Chaos does not store your card number.</p>
      <h2>Analytics and advertising</h2><p>Current analytics are first-party and raw analytics records are retained for approximately 180 days. Airport Chaos currently has no advertising tracking SDK. ${legalConfig.legalEntityName} does not sell personal information.</p>
      <h2>Operator, storage, and choices</h2><p>${legalConfig.productName} is operated by ${legalConfig.legalEntityName}. ${legalConfig.publicBrand} is a product/brand operated by ${legalConfig.legalEntityName}. Live Session Score is temporary and resets when the session ends. Persistent profile data includes Credits, aircraft unlocks, City Level and Mastery, missions, gameplay statistics, discoveries, and entitlements. Weekly leaderboard category records may be stored separately, and Best Score may be saved locally in your browser. The session authentication cookie is necessary to associate this browser with that profile. For support, contact ${support}.</p>`,
  },
  refund: {
    title: 'Digital Purchase & Refund Policy', updated: 'September 14, 2026',
    content: `<h2>Firehawk unlock</h2><p>The Firehawk permanent digital unlock currently costs ${firehawkProduct.displayPrice} ${firehawkProduct.currency.toUpperCase()}. Please use the free five-minute test flight before purchasing to confirm that the aircraft and game work for you.</p>
      <h2>Purchase records</h2><p>After purchase, save the recovery code and purchase support reference. They help Support locate and restore the entitlement without exposing payment-card data.</p>
      <h2>Operator and support</h2><p>${legalConfig.productName} is operated by ${legalConfig.legalEntityName}. ${legalConfig.publicBrand} is a product/brand operated by ${legalConfig.legalEntityName}.</p>
      <h2>Problems and refund requests</h2><p>For duplicate charges, an incorrect purchase, a missing entitlement, or a technical purchase problem, contact ${support} with the support reference. Refund requests are evaluated according to applicable law and the payment circumstances; this policy does not remove rights provided by law.</p>`,
  },
};

function escape(value: string): string {
  return value.replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]!);
}

export function policyPage(pathname: string): string | undefined {
  const key = (Object.entries(legalConfig.policyRoutes).find(([, route]) => route === pathname)?.[0]) as PolicyKey | undefined;
  if (!key) return undefined;
  const page = sections[key];
  const nav = Object.entries(legalConfig.policyRoutes).map(([name, route]) => `<a${name === key ? ' aria-current="page"' : ''} href="${route}">${name === 'refund' ? 'Refund Policy' : name[0].toUpperCase() + name.slice(1)}</a>`).join('');
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escape(page.title)} · ${legalConfig.productName}</title><style>
    *{box-sizing:border-box}body{margin:0;background:radial-gradient(circle at 50% 0,#173e57,#07131f 55%);color:#dcecf4;font:16px/1.65 system-ui,sans-serif}main{width:min(760px,calc(100% - 28px));margin:32px auto;padding:clamp(22px,5vw,48px);background:#081a29ed;border:1px solid #57c7df66;border-radius:12px;box-shadow:0 20px 60px #0006}header{border-bottom:1px solid #ffffff20;padding-bottom:20px}h1{margin:.15em 0;color:#fff;font-size:clamp(30px,6vw,48px)}h2{margin:1.6em 0 .25em;color:#79d8eb;font-size:19px}p{margin:.35em 0;color:#c5d8e2}small{color:#8faebb}.brand{color:#ffd45d;font-weight:800;letter-spacing:.12em;text-transform:uppercase}nav,footer{display:flex;flex-wrap:wrap;gap:10px 18px}nav{margin-top:15px}a{color:#7edcf0}a[aria-current]{color:#ffd45d}footer{margin-top:36px;padding-top:20px;border-top:1px solid #ffffff20;justify-content:space-between}@media(max-width:480px){main{margin:14px auto;padding:20px}footer{display:grid}}
  </style></head><body><main><header><div class="brand">${legalConfig.productName}</div><h1>${escape(page.title)}</h1><small>Last updated ${escape(page.updated)}</small><nav>${nav}</nav></header>${page.content}<footer><span>© 2026 ${legalConfig.legalEntityName}. ${legalConfig.publicBrand} is a product/brand operated by ${legalConfig.legalEntityName}. All rights reserved.</span><a href="/">Return to Airport Chaos</a><a href="mailto:${legalConfig.supportEmail}">Support</a></footer></main></body></html>`;
}

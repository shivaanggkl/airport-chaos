import { legalConfig } from '../../shared/legal-config.mjs';

type PolicyKey = keyof typeof legalConfig.policyRoutes;

const support = `<a href="mailto:${legalConfig.supportEmail}">${legalConfig.supportEmail}</a>`;
const sections: Record<PolicyKey, { title: string; updated: string; content: string }> = {
  terms: {
    title: 'Terms of Use', updated: 'October 5, 2026',
    content: `<h2>Using Airport Chaos</h2><p>${legalConfig.productName} is a browser-based game operated by ${legalConfig.legalEntityName}. ${legalConfig.publicBrand} is a product/brand operated by ${legalConfig.legalEntityName}. Gameplay is free, with optional paid digital content. You must be legally able to make online purchases where you live, or have permission from a parent or guardian.</p>
      <h2>Digital content</h2><p>Sky Tokens are optional digital game currency for eligible Airport Chaos content. They are not cryptocurrency, have no cash redemption value, cannot be transferred between players, and do not expire while the account remains valid, subject to applicable law. A permanent Firehawk unlock grants an entitlement to the associated player profile. Historical direct purchases remain restorable. Credits and Score are game values only and cannot be redeemed or transferred for money.</p>
      <h2>Fair play</h2><p>Do not cheat, exploit bugs, disrupt the service, or abuse other players. Access or features may be restricted when reasonably necessary to protect players, purchases, or the game.</p>
      <h2>Service changes</h2><p>Aircraft, missions, balance, cities, and other features may change as the game develops. Continuous, error-free, or uninterrupted availability is not guaranteed. The game and digital content are provided to the extent permitted by applicable law, without promises beyond those expressly stated here.</p>
      <h2>Third-party services</h2><p>Web purchases use Stripe Checkout; native app purchases use the applicable Apple App Store or Google Play billing service. Their applicable terms and privacy practices also apply. Nothing here limits rights that cannot legally be limited.</p>
      <h2>Questions</h2><p>For support, contact ${support}.</p>`,
  },
  privacy: {
    title: 'Privacy Notice', updated: 'October 5, 2026',
    content: `<h2>Information used by the game</h2><p>Airport Chaos processes an anonymous pilot identifier, a live session identifier, gameplay and progression statistics, first-party analytics events, and an authentication cookie used to reconnect you to your player profile. Normal game accounts do not use or store raw passwords.</p>
      <h2>Trial-abuse prevention</h2><p>To limit repeated free-aircraft trials, Airport Chaos may derive a temporary security identifier from your network address using a server-secret keyed hash. The raw IP address is not stored for this purpose. The derived identifier expires after the limited 24-hour anti-abuse period.</p>
      <h2>Purchases and support</h2><p>For purchases and support, we may store a purchase reference, provider, product, amount and currency, Sky Token wallet transactions, refund status, recovery information, and entitlement status. Payment card details are handled by the applicable payment provider; Airport Chaos does not store your card number.</p>
      <h2>Analytics and advertising</h2><p>Current analytics are first-party and raw analytics records are retained for approximately 180 days. Airport Chaos currently has no advertising tracking SDK. ${legalConfig.legalEntityName} does not sell personal information.</p>
      <h2>Operator, storage, and choices</h2><p>${legalConfig.productName} is operated by ${legalConfig.legalEntityName}. ${legalConfig.publicBrand} is a product/brand operated by ${legalConfig.legalEntityName}. Live Session Score is temporary and resets when the session ends. Persistent profile data includes Credits, Sky Tokens, aircraft unlocks, City Level and Mastery, missions, gameplay statistics, discoveries, and entitlements. Weekly leaderboard category records may be stored separately, and Best Score may be saved locally in your browser. The session authentication cookie is necessary to associate this browser with that profile. For support, contact ${support}.</p>`,
  },
  refund: {
    title: 'Digital Purchase & Refund Policy', updated: 'October 5, 2026',
    content: `<h2>Sky Tokens and unlocks</h2><p>Optional Sky Token packs are offered at their displayed checkout or store price. The App Store and Google Play show their localized price before payment. Sky Tokens can unlock eligible aircraft permanently. Firehawk can be tried free for five minutes before unlocking.</p>
      <h2>Purchase records</h2><p>Keep your Token purchase support reference. Historical direct Firehawk purchasers may use their recovery code and purchase reference to restore access.</p>
      <h2>Refunds and reversals</h2><p>A provider-confirmed refund or reversal may remove the corresponding Sky Tokens. If those Tokens have already been used, future purchased Tokens first settle the resulting account deficit before becoming spendable. Existing aircraft are not automatically removed.</p>
      <h2>Operator and support</h2><p>${legalConfig.productName} is operated by ${legalConfig.legalEntityName}. ${legalConfig.publicBrand} is a product/brand operated by ${legalConfig.legalEntityName}.</p>
      <h2>Problems and refund requests</h2><p>For duplicate charges, an incorrect purchase, a missing entitlement, or a technical purchase problem, contact ${support} with the support reference. Refund requests are evaluated according to applicable law and the payment circumstances; this policy does not remove rights provided by law.</p>`,
  },
  support: {
    title: 'Support', updated: 'October 5, 2026',
    content: `<h2>Contact Airport Chaos support</h2><p>Email ${support} for help with gameplay access, technical problems, Sky Token purchases or refunds, or restoring a historical Firehawk entitlement.</p>
      <h2>Purchase help</h2><p>Include the purchase support reference or historical recovery code when available. Do not send payment-card details or passwords.</p>
      <h2>Technical help</h2><p>Describe the city, device, browser or app, and the action that caused the problem. Screenshots are helpful when they do not contain private information.</p>`,
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
    *{box-sizing:border-box}body{margin:0;background:radial-gradient(circle at 50% 0,#173e57,#07131f 55%);color:#dcecf4;font:16px/1.65 system-ui,sans-serif}main{width:min(760px,calc(100% - 28px));margin:32px auto;padding:clamp(22px,5vw,48px);background:#081a29ed;border:1px solid #57c7df66;border-radius:12px;box-shadow:0 20px 60px #0006}header{border-bottom:1px solid #ffffff20;padding-bottom:20px}h1{margin:.15em 0;color:#fff;font-size:clamp(30px,6vw,48px)}h2{margin:1.6em 0 .25em;color:#F9B00A;font-size:19px}p{margin:.35em 0;color:#c5d8e2}small{color:#8faebb}.brand{color:#ffd45d;font-weight:800;letter-spacing:.12em;text-transform:uppercase}nav,footer{display:flex;flex-wrap:wrap;gap:10px 18px}nav{margin-top:15px}a{color:#F9B00A}a:hover,a:focus-visible{color:#ffd05a}a[aria-current]{color:#F9B00A}footer{margin-top:36px;padding-top:20px;border-top:1px solid #ffffff20;justify-content:space-between}@media(max-width:480px){main{margin:14px auto;padding:20px}footer{display:grid}}
  </style></head><body><main><header><div class="brand">${legalConfig.productName}</div><h1>${escape(page.title)}</h1><small>Last updated ${escape(page.updated)}</small><nav>${nav}</nav></header>${page.content}<footer><span>© 2026 ${legalConfig.legalEntityName}. ${legalConfig.publicBrand} is a product/brand operated by ${legalConfig.legalEntityName}. All rights reserved.</span><a href="/">Return to Airport Chaos</a><a href="${legalConfig.policyRoutes.support}">Support</a></footer></main></body></html>`;
}

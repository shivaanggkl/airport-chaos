export function aceInterceptIntroText(elapsed) {
  return elapsed < 2000 ? 'ACE INTERCEPT' : elapsed < 5000 ? 'A dangerous Firehawk has entered Dallas airspace!'
    : elapsed < 8000 ? 'Intercept and destroy the enemy!' : 'Watch out — this pilot fights back!';
}

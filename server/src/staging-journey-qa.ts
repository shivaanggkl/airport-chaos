// Temporary staging-only access for testing missions out of order. It never
// marks missions complete or changes the reward and achievement ledgers.
export function stagingJourneyQaUnlockEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.JOURNEY_STAGING_UNLOCK_ALL === 'true'
    && env.RENDER_SERVICE_ID === 'srv-db246fflot8c73dp2p40'
    && env.RENDER_GIT_BRANCH === 'staging';
}

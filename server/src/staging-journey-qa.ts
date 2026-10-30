// Temporary staging-only access for testing missions out of order. It never
// marks missions complete or changes the reward and achievement ledgers.
export function stagingJourneyQaUnlockEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.JOURNEY_STAGING_UNLOCK_ALL === 'true'
    && stagingJourneyQaPilotUnlockEnabled(env);
}

export function stagingJourneyQaPilotUnlockEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.RENDER_SERVICE_ID === 'srv-db246fflot8c73dp2p40'
    && env.RENDER_GIT_BRANCH === 'staging';
}

// Isolated local QA may use an ephemeral profile database without recording
// artificial clears. Never accept this switch on Render or a production server.
export function localJourneyQaUnlockEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.AIRPORT_CHAOS_LOCAL_QA_UNLOCK_ALL === 'true'
    && env.AIRPORT_CHAOS_DEV_QA === '1'
    && env.NODE_ENV !== 'production'
    && !env.RENDER_SERVICE_ID
    && /^\/private\/tmp\/airport-chaos-[^/]+\.sqlite$/.test(env.AIRPORT_CHAOS_PROFILE_DB ?? '');
}

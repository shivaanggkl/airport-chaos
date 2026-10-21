// The same timeline drives the player presentation and the server's minimum
// watch time for the alternative Milwaukee training completion path.
export const trainingFilmScenes = Object.freeze([
  { id: 'intro', title: 'WELCOME, PILOT', detail: 'Watch the flight from runway to landing, then take the controls whenever you are ready.', durationMs: 4000 },
  { id: 'hud', title: 'READ THE FLIGHT DISPLAY', detail: 'Health, speed, and altitude stay at the top. The radar shows nearby aircraft, airports, and your destination.', durationMs: 5000 },
  { id: 'throttle', title: 'BUILD TAKEOFF SPEED', detail: 'Slide the throttle up. Watch the speed indicator as the aircraft accelerates down the runway.', durationMs: 5000 },
  { id: 'takeoff', title: 'TAKE OFF', detail: 'When you have enough speed, raise the nose with the joystick and lift away from the runway.', durationMs: 5000 },
  { id: 'turns', title: 'TURN LEFT AND RIGHT', detail: 'Move the joystick left or right to steer. Release it to settle the turn.', durationMs: 5000 },
  { id: 'altitude', title: 'CLIMB AND DESCEND', detail: 'Use the vertical joystick direction to gain or lose altitude. The direction follows your flight pitch setting.', durationMs: 5000 },
  { id: 'camera', title: 'LOOK AROUND', detail: 'Drag the view to look around your aircraft. Pinch to zoom in or out.', durationMs: 5000 },
  { id: 'map', title: 'USE THE RADAR AND MAP', detail: 'Tap the radar to open the city map. Find your aircraft, airports, and the route ahead.', durationMs: 5000 },
  { id: 'players', title: 'SEE OTHER PILOTS', detail: 'The Players tab shows real pilots in your city. Milwaukee practice may show only you.', durationMs: 4000 },
  { id: 'territories', title: 'CHECK TERRITORIES', detail: 'The Territories tab shows controlled areas in cities where territory play is available.', durationMs: 5000 },
  { id: 'objective', title: 'FOLLOW YOUR OBJECTIVE', detail: 'Read the mission card and use the direction marker to find the next target or destination.', durationMs: 5000 },
  { id: 'target', title: 'FIND A TARGET', detail: 'Bring an aircraft into the lock circle, then adjust your aim until it is lined up.', durationMs: 5000 },
  { id: 'fire', title: 'FIRE WHEN READY', detail: 'Use the Fire button after you have lined up the target. Watch your surroundings as you fly.', durationMs: 5000 },
  { id: 'landing', title: 'LINE UP AND LAND', detail: 'Return to the runway, slow the throttle, align with the centerline, and descend gently.', durationMs: 6000 },
  { id: 'finish', title: 'READY FOR DALLAS', detail: 'You have seen the full flight. Dallas unlocks when this presentation finishes.', durationMs: 5000 },
]);

export const TRAINING_FILM_DURATION_MS = trainingFilmScenes.reduce((total, scene) => total + scene.durationMs, 0);

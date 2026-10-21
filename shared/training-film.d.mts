export type TrainingFilmSceneId = 'intro' | 'hud' | 'throttle' | 'takeoff' | 'turns' | 'altitude' | 'camera' | 'map' | 'players' | 'territories' | 'objective' | 'target' | 'fire' | 'landing' | 'finish';
export declare const trainingFilmScenes: readonly Readonly<{ id: TrainingFilmSceneId; title: string; detail: string; durationMs: number }>[];
export declare const TRAINING_FILM_DURATION_MS: number;

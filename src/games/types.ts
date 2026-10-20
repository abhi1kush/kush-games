import type { ComponentType, LazyExoticComponent } from 'react';

export type GameCategory = 'Puzzle' | 'Arcade' | 'Strategy' | 'Classic Board';
export type GameStatus = 'playable' | 'coming-soon';

/** Generated card art: a gradient, an accent colour and a big glyph. No images needed. */
export interface GameArtwork {
  gradientFrom: string;
  gradientTo: string;
  accentColor: string;
  glyph: string;
}

export interface GameDefinition {
  /** URL-safe id, used in routes like #/play/<id> */
  id: string;
  title: string;
  tagline: string;
  description: string;
  categories: GameCategory[];
  status: GameStatus;
  artwork: GameArtwork;
  controls: string;
  releaseYear: number;
  /** Lazy-loaded game component; required when status is 'playable'. */
  component?: LazyExoticComponent<ComponentType>;
}

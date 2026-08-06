/** A single performance: one artist, one stage, one time window. */
export interface ArtistSet {
  name: string;
  slug: string;
  /** Stage/venue slug (keys into the festival walk graph). */
  stage: string;
  start: Date;
  end: Date;
  durationMin: number;
}

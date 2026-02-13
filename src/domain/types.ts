export type Id = string;

export interface LatLng {
  lat: number;
  lng: number;
}

export interface GreenTargets {
  front: LatLng;
  middle: LatLng;
  back: LatLng;
}

export type HazardType = 'bunker' | 'water' | 'trees' | 'layup' | 'other';

export interface Hazard {
  id: Id;
  name: string;
  type: HazardType;
  location: LatLng;
}

export interface Hole {
  number: number;
  par: number;
  strokeIndex?: number;
  lengthYards?: number;
  green: GreenTargets;
  hazards: Hazard[];
}

export interface TeeOption {
  id: Id;
  name: string;
  courseRating?: number;
  slopeRating?: number;
}

export interface Course {
  id: Id;
  name: string;
  clubName?: string;
  locationName?: string;
  holes: Hole[];
  tees: TeeOption[];
  isDemo?: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface HoleScore {
  holeNumber: number;
  strokes: number;
  putts?: number;
  penalties?: number;
  gir?: boolean;
  fir?: boolean;
}

export interface Round {
  id: Id;
  courseId: Id;
  teeId?: Id;
  startedAt: string;
  completedAt?: string;
  scores: HoleScore[];
  stablefordEnabled: boolean;
}

export type DistanceUnit = 'yards' | 'meters';

export interface TileSource {
  id: string;
  name: string;
  urlTemplate: string;
  attribution: string;
}

export interface UserSettings {
  id: 'user-settings';
  distanceUnit: DistanceUnit;
  tileSourceId: string;
  updatedAt: string;
}

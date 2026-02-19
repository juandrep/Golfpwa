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

export interface HazardZone {
  id: Id;
  name: string;
  type: HazardType;
  points: LatLng[];
}

export interface HoleAreas {
  fairway: LatLng[];
  green: LatLng[];
  hazards: HazardZone[];
}

export interface Hole {
  number: number;
  par: number;
  strokeIndex?: number;
  lengthYards?: number;
  tee?: LatLng;
  teePoints?: Record<string, LatLng>;
  green: GreenTargets;
  hazards: Hazard[];
  areas?: HoleAreas;
}

export interface TeeOption {
  id: Id;
  name: string;
  courseRating?: number;
  slopeRating?: number;
}

export type CoursePublishStatus = 'draft' | 'published';
export type CourseQaSeverity = 'error' | 'warning';

export interface CourseQaIssue {
  id: string;
  holeNumber: number;
  severity: CourseQaSeverity;
  message: string;
}

export interface CourseQaReport {
  checkedAt: string;
  errorCount: number;
  warningCount: number;
  issues: CourseQaIssue[];
}

export interface Course {
  id: Id;
  name: string;
  clubName?: string;
  locationName?: string;
  holes: Hole[];
  draftHoles?: Hole[];
  publishStatus?: CoursePublishStatus;
  publishedAt?: string;
  qaReport?: CourseQaReport;
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
  handicapAtStart?: number;
  currentHoleNumber?: number;
  startedAt: string;
  completedAt?: string;
  updatedAt?: string;
  scores: HoleScore[];
  stablefordEnabled: boolean;
}

export type PlayerRole = 'member' | 'visitor';
export type MembershipStatus = 'pending' | 'approved';

export type DistanceUnit = 'yards' | 'meters';

export interface TileSource {
  id: string;
  name: string;
  urlTemplate: string;
  attribution: string;
  labelOverlayUrlTemplate?: string;
}

export interface UserSettings {
  id: 'user-settings';
  distanceUnit: DistanceUnit;
  tileSourceId: string;
  updatedAt: string;
}

export interface UserProfile {
  uid: string;
  email: string;
  displayName: string;
  role: PlayerRole;
  membershipStatus: MembershipStatus;
  handicapIndex: string;
  homeCourse: string;
  onboardingCompletedAt?: string;
  updatedAt: string;
}

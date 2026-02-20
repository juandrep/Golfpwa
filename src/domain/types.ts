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

export type RoundFormat = 'stroke-play' | 'stableford' | 'match-play' | 'scramble';

export interface RoundWeatherContext {
  temperatureC?: number;
  windKph?: number;
  condition?: string;
  source?: string;
  fetchedAt: string;
}

export interface RoundShot {
  id: Id;
  holeNumber: number;
  club: string;
  location: LatLng;
  recordedAt: string;
  distanceFromPreviousMeters?: number;
}

export interface Round {
  id: Id;
  courseId: Id;
  teeId?: Id;
  format?: RoundFormat;
  teamId?: Id;
  teamEventId?: Id;
  weather?: RoundWeatherContext;
  handicapAtStart?: number;
  currentHoleNumber?: number;
  startedAt: string;
  completedAt?: string;
  updatedAt?: string;
  scores: HoleScore[];
  shots?: RoundShot[];
  stablefordEnabled: boolean;
}

export interface TeamMember {
  uid: string;
  email: string;
  displayName: string;
  joinedAt: string;
}

export interface Team {
  id: Id;
  name: string;
  inviteCode: string;
  ownerUid: string;
  isPrivate: boolean;
  members: TeamMember[];
  createdAt: string;
  updatedAt: string;
}

export interface TeamEvent {
  id: Id;
  teamId: Id;
  name: string;
  format: RoundFormat;
  startsAt: string;
  endsAt: string;
  createdByUid: string;
  createdAt: string;
  updatedAt: string;
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
  lastRoundSetup?: {
    courseId: string;
    teeId?: string;
    format: RoundFormat;
  };
  onboardingCompletedAt?: string;
  updatedAt: string;
}

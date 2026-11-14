export interface User {
  id: number;
  email: string;
  name: string;
  skills: string[];
  timezone: string;
  utcOffsetMin: number;
  lookingForTeam: boolean;
}

export interface TeamDto {
  id: number;
  hackathonId: number;
  name: string;
  leaderId: number;
  leaderName?: string;
  memberCount: number;
  minTeamSize: number;
  maxTeamSize: number;
  openSeats?: number;
  isOpen: boolean;
  isComplete: boolean;
  inviteExpiresAt?: string | null;
  skills?: string[];
  createdAt: string;
}

export interface TeamMember {
  userId: number;
  name: string;
  skills: string[];
  timezone: string;
  isLeader: boolean;
  joinedAt: string;
}

export interface TeamDetails {
  team: TeamDto;
  members: TeamMember[];
}

export interface JoinRequest {
  id: number;
  teamId: number;
  userId: number;
  userName?: string;
  teamName?: string;
  status: 'pending' | 'accepted' | 'declined' | 'cancelled';
  skills?: string[];
  timezone?: string;
  createdAt: string;
  decidedAt?: string | null;
}

export interface AuditLogEntry {
  id: number;
  at: string;
  actorId: number | null;
  actorName: string;
  action: string;
  details: Record<string, any>;
}

export interface SuggestionExplanation {
  totalScore: number;
  skillScore: number;
  timezoneScore: number;
  complementarySkills: string[];
  overlappingSkills: string[];
  timezoneDiffHours: number;
  summary: string;
}

export interface SuggestionResult {
  userId: number;
  name: string;
  skills: string[];
  timezone: string;
  score: number;
  explanation: SuggestionExplanation;
}

export interface BoardData {
  teams: TeamDto[];
  totalTeams: number;
  page: number;
  limit: number;
  usersLooking: {
    userId: number;
    name: string;
    skills: string[];
    timezone: string;
    createdAt: string;
  }[];
}

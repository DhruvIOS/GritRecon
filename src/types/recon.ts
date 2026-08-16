export interface ReviewItem {
  source: string;
  text: string;
  gradeReceived: string;
  date: Date | string;
}

export interface TeacherNode {
  id?: string;
  firstName?: string;
  lastName?: string;
  school?: {
    id?: string;
    name?: string;
  };
  avgDifficulty?: number;
  wouldTakeAgainPercent?: number;
  ratings?: {
    edges?: Array<{
      node?: {
        comment?: string;
        date?: string;
        grade?: string;
      };
    }>;
  };
}

export interface TeacherEdge {
  node?: TeacherNode;
}

export interface GritviewGradeRecord {
  A?: number;
  B?: number;
  C?: number;
  D?: number;
  F?: number;
}

export interface GritviewReviewRecord {
  body?: string;
  grade?: string;
  posted?: string;
}

export interface GradeDistribution {
  aPercent: number;
  bPercent: number;
  cPercent: number;
  dPercent: number;
  fPercent: number;
}

export interface ReconResponsePayload {
  fullName: string;
  averageGrade: string;
  gpa: number;
  passRate: number;
  difficulty: number;
  wouldTakeAgain: number;
  gradeDistribution: GradeDistribution;
  riskFlags: string[];
  recentReviews: ReviewItem[];
  lastUpdated: Date | string;
}

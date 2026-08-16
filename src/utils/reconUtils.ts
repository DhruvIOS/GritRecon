import { ReviewItem, GradeDistribution } from '@/types/recon';

export function escapeRegExp(string: string): string {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function normalizeNameInput(name: string): string {
  let cleaned = name.trim();
  cleaned = cleaned.replace(/^(dr\.|doctor|prof\.|professor)\s+/i, '');
  cleaned = cleaned.replace(/\s+(jr\.|sr\.|iii|ii|iv|ph\.?d\.?)$/i, '');
  cleaned = cleaned.replace(/[^a-zA-Z\s\-']/g, '').replace(/\s+/g, ' ').slice(0, 80).trim();
  return cleaned;
}

export function cleanReviewText(text: string): string {
  if (!text) return 'No review comment provided.';
  return text
    .replace(/&#8212;/g, '—')
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .trim();
}

export function generateEstimatedGradeDistribution(
  gpa: number,
  passRate: number
): GradeDistribution {
  if (gpa <= 0 && passRate <= 0) {
    return { aPercent: 35, bPercent: 35, cPercent: 15, dPercent: 10, fPercent: 5 };
  }
  let a = 35,
    b = 35,
    c = 15,
    d = 10,
    f = 5;
  if (gpa >= 3.5) {
    a = 55;
    b = 30;
    c = 10;
    d = 3;
    f = 2;
  } else if (gpa >= 3.0) {
    a = 42;
    b = 38;
    c = 12;
    d = 5;
    f = 3;
  } else if (gpa >= 2.5) {
    a = 28;
    b = 38;
    c = 20;
    d = 9;
    f = 5;
  } else if (gpa >= 2.0) {
    a = 18;
    b = 32;
    c = 28;
    d = 14;
    f = 8;
  } else {
    a = 10;
    b = 25;
    c = 30;
    d = 20;
    f = 15;
  }

  if (passRate > 0) {
    const nonPass = Math.max(0, 100 - passRate);
    d = Math.round(nonPass * 0.6);
    f = Math.round(nonPass * 0.4);
    const remaining = 100 - (d + f);
    a = Math.round(remaining * (gpa >= 3.0 ? 0.55 : 0.4));
    b = Math.round(remaining * (gpa >= 3.0 ? 0.35 : 0.4));
    c = Math.max(0, 100 - (a + b + d + f));
  }
  return { aPercent: a, bPercent: b, cPercent: c, dPercent: d, fPercent: f };
}

export function mixReviews(reviews: ReviewItem[]): ReviewItem[] {
  if (reviews.length <= 1) return reviews;

  const positive: ReviewItem[] = [];
  const critical: ReviewItem[] = [];
  const neutral: ReviewItem[] = [];

  for (const r of reviews) {
    const text = cleanReviewText(r.text);
    const cleanedItem = { ...r, text };
    const lowerText = text.toLowerCase();
    const grade = (r.gradeReceived || '').toUpperCase();

    const isCriticalGrade = ['C', 'D', 'F', 'C+', 'C-', 'D+', 'D-'].some(
      (cg) => grade === cg
    );
    const isCriticalText = [
      'hard',
      'tough',
      'avoid',
      'trap',
      'unfair',
      'heavy',
      'difficult',
      'fail',
      'bad',
      'harsh',
      'worst',
      'unclear',
      'careless',
      'rough',
      'strict',
    ].some((kw) => lowerText.includes(kw));

    if (isCriticalGrade || isCriticalText) {
      critical.push(cleanedItem);
    } else if (
      ['A', 'A+', 'A-', 'B+'].some((pg) => grade === pg) ||
      [
        'great',
        'best',
        'love',
        'amazing',
        'recommend',
        'good',
        'digest',
        'easy',
        'clear',
      ].some((kw) => lowerText.includes(kw))
    ) {
      positive.push(cleanedItem);
    } else {
      neutral.push(cleanedItem);
    }
  }

  const mixed: ReviewItem[] = [];
  const maxLen = Math.max(positive.length, critical.length, neutral.length);

  for (let i = 0; i < maxLen; i++) {
    if (positive[i]) mixed.push(positive[i]);
    if (critical[i]) mixed.push(critical[i]);
    if (neutral[i]) mixed.push(neutral[i]);
  }

  const seen = new Set<string>();
  const uniqueMixed = mixed.filter((r) => {
    const snippet = r.text.slice(0, 35).toLowerCase();
    if (seen.has(snippet)) return false;
    seen.add(snippet);
    return true;
  });

  return uniqueMixed.slice(0, 20);
}

export function calculateRiskFlags(professor: {
  difficulty: number;
  wouldTakeAgain: number;
  passRate: number;
  gpa: number;
  recentReviews: ReviewItem[];
  gradeDistribution?: { aPercent: number; fPercent: number };
}): string[] {
  const flags: string[] = [];
  const totalReviews = professor.recentReviews?.length || 0;
  const fRate = professor.gradeDistribution?.fPercent || 0;

  if (professor.difficulty >= 3.8 && (professor.passRate < 70 || fRate > 15)) {
    flags.push('TRAP_CLASS');
  }

  if (professor.difficulty <= 2.8 && (professor.gradeDistribution?.aPercent || 0) >= 50) {
    flags.push('EASY_A_GEM');
  }

  if (totalReviews < 3) {
    flags.push('LIMITED_DATA');
  }

  if (professor.gpa > 0 && professor.gpa < 2.5 && professor.difficulty >= 3.5) {
    flags.push('TOUGH_GRADING');
  }

  if (professor.wouldTakeAgain >= 80 && professor.passRate > 0 && professor.passRate < 70) {
    flags.push('MIXED_SIGNALS');
  }

  return flags;
}

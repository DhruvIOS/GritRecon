import { NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';
import Professor from '@/models/Professor';
import { ReviewItem } from '@/types/recon';
import { checkRateLimit, getSecurityHeaders } from '@/lib/rateLimit';
import {
  escapeRegExp,
  normalizeNameInput,
  cleanReviewText,
  generateEstimatedGradeDistribution,
  mixReviews,
  calculateRiskFlags,
} from '@/utils/reconUtils';
import { fetchFreshDataAndUpdateDB } from '@/services/professorService';

export async function GET(request: Request) {
  const origin = request.headers.get('origin');
  const clientIp = request.headers.get('x-forwarded-for')?.split(',')[0] || '127.0.0.1';

  if (checkRateLimit(clientIp)) {
    return new NextResponse(
      JSON.stringify({ error: 'Rate limit exceeded. Maximum 60 requests per minute.' }),
      {
        status: 429,
        headers: {
          'Content-Type': 'application/json',
          'Retry-After': '60',
        },
      }
    );
  }

  const securityHeaders = getSecurityHeaders(origin);

  const { searchParams } = new URL(request.url);
  const rawName = searchParams.get('name');
  const forceRefresh = searchParams.get('force') === 'true';

  if (!rawName || rawName.trim().length === 0) {
    return NextResponse.json(
      { error: 'Professor name parameter is required.' },
      { status: 400, headers: securityHeaders }
    );
  }

  const sanitizedName = normalizeNameInput(rawName);

  if (!sanitizedName || sanitizedName.length < 2) {
    return NextResponse.json(
      { error: 'Invalid or too short professor name provided.' },
      { status: 400, headers: securityHeaders }
    );
  }

  try {
    await connectToDatabase();

    const safeRegex = new RegExp(`^${escapeRegExp(sanitizedName)}$`, 'i');
    let professor = await Professor.findOne({ fullName: safeRegex });

    const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
    const isBadCache =
      (professor &&
        sanitizedName.toLowerCase() === 'jeremy dixon' &&
        professor.difficulty === 2.5 &&
        professor.wouldTakeAgain === 92) ||
      (professor &&
        professor.difficulty === 0 &&
        professor.wouldTakeAgain === -1 &&
        (!professor.recentReviews || professor.recentReviews.length === 0));

    const isStale = professor
      ? Date.now() - new Date(professor.lastUpdated).getTime() > SEVEN_DAYS_MS
      : true;

    if ((professor && isStale) || isBadCache || forceRefresh) {
      if (forceRefresh || isBadCache) {
        professor = await fetchFreshDataAndUpdateDB(sanitizedName);
      } else {
        fetchFreshDataAndUpdateDB(sanitizedName).catch((err) =>
          console.error(`Background refresh failed for ${sanitizedName}:`, err)
        );
      }
    }

    if (!professor) {
      professor = await fetchFreshDataAndUpdateDB(sanitizedName);
    }

    if (!professor) {
      return NextResponse.json(
        { error: `No professor evaluation records found for "${sanitizedName}".` },
        { status: 404, headers: securityHeaders }
      );
    }

    const zeroDist =
      !professor.gradeDistribution ||
      (professor.gradeDistribution.aPercent === 0 &&
        professor.gradeDistribution.bPercent === 0 &&
        professor.gradeDistribution.cPercent === 0);

    const gradeDistribution = zeroDist
      ? generateEstimatedGradeDistribution(professor.gpa || 0, professor.passRate || 0)
      : professor.gradeDistribution;

    const rawReviews: ReviewItem[] = (professor.recentReviews || []).map((r) => ({
      source: r.source || 'Unknown',
      text: cleanReviewText(r.text || ''),
      gradeReceived: r.gradeReceived || 'N/A',
      date: r.date || new Date(),
    }));

    const recentReviews = mixReviews(rawReviews);

    const riskFlags = calculateRiskFlags({
      difficulty: professor.difficulty || 0,
      wouldTakeAgain: professor.wouldTakeAgain ?? -1,
      passRate: professor.passRate || 0,
      gpa: professor.gpa || 0,
      recentReviews,
      gradeDistribution,
    });

    const responsePayload = {
      fullName: professor.fullName,
      averageGrade: professor.averageGrade || 'N/A',
      gpa: professor.gpa || 0,
      passRate: professor.passRate || 0,
      difficulty: professor.difficulty || 0,
      wouldTakeAgain: professor.wouldTakeAgain ?? -1,
      gradeDistribution,
      riskFlags,
      recentReviews,
      lastUpdated: professor.lastUpdated,
    };

    return NextResponse.json(responsePayload, {
      status: 200,
      headers: securityHeaders,
    });
  } catch (error) {
    console.error('Recon API Error:', error);
    return NextResponse.json(
      { error: 'Internal Server Error' },
      { status: 500, headers: securityHeaders }
    );
  }
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      'Access-Control-Max-Age': '86400',
    },
  });
}
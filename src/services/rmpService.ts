import { TeacherEdge, TeacherNode, ReviewItem } from '@/types/recon';
import { cleanReviewText } from '@/utils/reconUtils';

const RMP_GRAPHQL_URL = 'https://www.ratemyprofessors.com/graphql';
const UMBC_SCHOOL_ID = 'U2Nob29sLTEyNDQ=';

export function findBestMatch(edges: TeacherEdge[], targetName: string): TeacherNode | null {
  if (!edges || edges.length === 0) return null;
  const targetLower = targetName.toLowerCase().trim();
  const targetParts = targetLower.split(/\s+/).filter(Boolean);

  let bestNode: TeacherNode | null = null;
  let bestScore = -1;

  for (const edge of edges) {
    const node = edge?.node;
    if (!node) continue;
    const first = (node.firstName || '').toLowerCase().trim();
    const last = (node.lastName || '').toLowerCase().trim();
    const full = `${first} ${last}`;

    let score = 0;

    if (full === targetLower) {
      score = 100;
    } else if (
      targetParts.length >= 2 &&
      first === targetParts[0] &&
      last === targetParts[targetParts.length - 1]
    ) {
      score = 90;
    } else if (
      targetParts.length >= 2 &&
      first.startsWith(targetParts[0][0]) &&
      (last === targetParts[targetParts.length - 1] ||
        last.startsWith(targetParts[targetParts.length - 1].slice(0, 4)))
    ) {
      score = 80;

    } else if (
      targetParts.length >= 2 &&
      first === targetParts[0] &&
      (last.startsWith(targetParts[targetParts.length - 1].slice(0, 4)) ||
        targetParts[targetParts.length - 1].startsWith(last.slice(0, 4)))
    ) {
      score = 60;
    } else if (
      edges.length === 1 &&
      (targetLower.includes(first) ||
        targetLower.includes(last) ||
        first.includes(targetParts[0]) ||
        last.includes(targetParts[0]))
    ) {
      score = 50;
    }

    if (score > bestScore) {
      bestScore = score;
      bestNode = node;
    }
  }

  if (bestScore < 40) return null;
  return bestNode;
}

export async function fetchRMPData(name: string): Promise<{
  difficulty: number;
  wouldTakeAgain: number;
  reviews: ReviewItem[];
} | null> {
  const searchTerms = [name];

  let matchedNode: TeacherNode | null = null;

  const defaultHeaders = {
    'Content-Type': 'application/json',
    Authorization: 'Basic dGVzdDp0ZXN0',
    'User-Agent':
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  };

  for (const term of searchTerms) {
    if (matchedNode) break;

    const searchQuery = `
      query ($text: String!, $schoolID: ID!) {
        newSearch {
          teachers(query: {text: $text, schoolID: $schoolID}) {
            edges {
              node {
                id
                firstName
                lastName
              }
            }
          }
        }
      }
    `;

    try {
      const searchRes = await fetch(RMP_GRAPHQL_URL, {
        method: 'POST',
        headers: defaultHeaders,
        body: JSON.stringify({
          query: searchQuery,
          variables: { text: term, schoolID: UMBC_SCHOOL_ID },
        }),
      });

      if (searchRes.ok) {
        const searchResult = await searchRes.json();
        const edges = searchResult?.data?.newSearch?.teachers?.edges || [];
        matchedNode = findBestMatch(edges, name);
      }
    } catch (err) {
      console.warn(`RMP school search failed for ${term}:`, err);
    }

    if (!matchedNode) {
      try {
        const globalQuery = `
          query ($text: String!) {
            newSearch {
              teachers(query: {text: $text}) {
                edges {
                  node {
                    id
                    firstName
                    lastName
                    school {
                      id
                      name
                    }
                  }
                }
              }
            }
          }
        `;
        const globalRes = await fetch(RMP_GRAPHQL_URL, {
          method: 'POST',
          headers: defaultHeaders,
          body: JSON.stringify({ query: globalQuery, variables: { text: term } }),
        });
        if (globalRes.ok) {
          const globalResult = await globalRes.json();
          const globalEdges: TeacherEdge[] =
            globalResult?.data?.newSearch?.teachers?.edges || [];
          const umbcEdges = globalEdges.filter(
            (e) =>
              e?.node?.school?.id === UMBC_SCHOOL_ID ||
              (e?.node?.school?.name || '')
                .toLowerCase()
                .includes('baltimore county')
          );
          matchedNode = findBestMatch(
            umbcEdges.length > 0 ? umbcEdges : globalEdges,
            name
          );
        }
      } catch (err) {
        console.warn(`RMP global fallback search failed for ${term}:`, err);
      }
    }
  }

  if (!matchedNode || !matchedNode.id) return null;

  const ratingsQuery = `
    query ($id: ID!) {
      node(id: $id) {
        ... on Teacher {
          avgDifficulty
          wouldTakeAgainPercent
          ratings(first: 50) {
            edges {
              node {
                comment
                date
                grade
              }
            }
          }
        }
      }
    }
  `;

  try {
    const ratingsRes = await fetch(RMP_GRAPHQL_URL, {
      method: 'POST',
      headers: defaultHeaders,
      body: JSON.stringify({
        query: ratingsQuery,
        variables: { id: matchedNode.id },
      }),
    });

    if (!ratingsRes.ok) return null;

    const ratingsResult = await ratingsRes.json();
    const teacherData: TeacherNode | undefined = ratingsResult?.data?.node;
    const ratingNodes = teacherData?.ratings?.edges || [];

    const formattedReviews: ReviewItem[] = ratingNodes.map((edge) => ({
      source: 'RMP',
      text: cleanReviewText(edge?.node?.comment || ''),
      gradeReceived: edge?.node?.grade || 'N/A',
      date: edge?.node?.date ? new Date(edge.node.date) : new Date(),
    }));

    const takeAgain =
      teacherData?.wouldTakeAgainPercent != null &&
      teacherData?.wouldTakeAgainPercent !== -1
        ? Math.round(teacherData.wouldTakeAgainPercent)
        : -1;

    const difficultyVal = teacherData?.avgDifficulty
      ? Math.round(teacherData.avgDifficulty * 10) / 10
      : 0;

    return {
      difficulty: difficultyVal,
      wouldTakeAgain: takeAgain,
      reviews: formattedReviews,
    };
  } catch (err) {
    console.warn(`RMP ratings fetch failed for ${matchedNode.id}:`, err);
    return null;
  }
}

import Professor from '@/models/Professor';
import { fetchGritviewData } from './gritviewService';
import { fetchRMPData } from './rmpService';
import { escapeRegExp, mixReviews } from '@/utils/reconUtils';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const inFlightRequests = new Map<string, Promise<any>>();

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function fetchFreshDataAndUpdateDB(name: string): Promise<any> {
  const key = name.toLowerCase().trim();
  if (inFlightRequests.has(key)) {
    return inFlightRequests.get(key);
  }

  const fetchPromise = (async () => {
    try {
      const [gritviewResult, rmpResult] = await Promise.allSettled([
        fetchGritviewData(name),
        fetchRMPData(name),
      ]);

      const gritviewData =
        gritviewResult.status === 'fulfilled' ? gritviewResult.value : null;
      const rmpData =
        rmpResult.status === 'fulfilled' ? rmpResult.value : null;

      if (!gritviewData && !rmpData) {
        await Professor.deleteOne({
          fullName: { $regex: new RegExp(`^${escapeRegExp(name)}$`, 'i') },
        });
        return null;
      }

      const mergedReviews = [
        ...(gritviewData?.reviews || []),
        ...(rmpData?.reviews || []),
      ];

      const sortedReviews = mixReviews(mergedReviews);

      const updatedProfessor = await Professor.findOneAndUpdate(
        { fullName: { $regex: new RegExp(`^${escapeRegExp(name)}$`, 'i') } },
        {
          $set: {
            fullName: name,
            averageGrade: gritviewData?.averageGrade || 'N/A',
            gpa: gritviewData?.gpa || 0,
            passRate: gritviewData?.passRate || 0,
            difficulty: rmpData?.difficulty ?? 0,
            wouldTakeAgain: rmpData?.wouldTakeAgain ?? -1,
            gradeDistribution: gritviewData?.gradeDistribution || {
              aPercent: 35,
              bPercent: 35,
              cPercent: 15,
              dPercent: 10,
              fPercent: 5,
            },
            recentReviews: sortedReviews,
            lastUpdated: new Date(),
          },
        },
        { returnDocument: 'after', upsert: true, runValidators: true }
      );

      if (updatedProfessor) return updatedProfessor;

      return await Professor.findOne({
        fullName: { $regex: new RegExp(`^${escapeRegExp(name)}$`, 'i') },
      });
    } catch (error) {
      console.error(`Sync pipeline failed for ${name}:`, error);
      return null;
    } finally {
      inFlightRequests.delete(key);
    }
  })();

  inFlightRequests.set(key, fetchPromise);
  return fetchPromise;
}

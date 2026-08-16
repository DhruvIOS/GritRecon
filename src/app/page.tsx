'use client';

import { useState } from 'react';

interface ReconData {
  fullName: string;
  averageGrade: string;
  gpa: number;
  passRate: number;
  difficulty: number;
  wouldTakeAgain: number;
  gradeDistribution?: {
    aPercent: number;
    bPercent: number;
    cPercent: number;
    dPercent: number;
    fPercent: number;
  };
  riskFlags?: string[];
  recentReviews?: Array<{
    source: string;
    text: string;
    gradeReceived: string;
    date: string;
  }>;
  lastUpdated?: string;
  error?: string;
}

export default function CommandCenter() {
  const [searchQuery, setSearchQuery] = useState('Kamran Fayyaz');
  const [loading, setLoading] = useState(false);
  const [reconData, setReconData] = useState<ReconData | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const fetchIntel = async (queryName: string, force = false) => {
    setLoading(true);
    setErrorMsg(null);
    try {
      const res = await fetch(`/api/recon?name=${encodeURIComponent(queryName)}${force ? '&force=true' : ''}`);
      const data = await res.json();
      if (!res.ok) {
        setErrorMsg(data.error || 'Failed to retrieve evaluation records.');
        setReconData(null);
      } else {
        setReconData(data);
      }
    } catch {
      setErrorMsg('Network failure or API server offline.');
      setReconData(null);
    } finally {
      setLoading(false);
    }
  };

  const getRiskBadge = (flag: string) => {
    switch (flag) {
      case 'TRAP_CLASS':
        return { label: '⚠️ Trap Class', cls: 'bg-red-500/20 text-red-400 border-red-500/30' };
      case 'EASY_A_GEM':
        return { label: '💎 High Grade Potential', cls: 'bg-amber-400/20 text-amber-300 border-amber-400/40' };
      case 'LIMITED_DATA':
        return { label: 'ℹ️ Limited Sample Size', cls: 'bg-amber-500/20 text-amber-400 border-amber-500/30' };
      case 'TOUGH_GRADING':
        return { label: '📉 Tough Grading', cls: 'bg-orange-500/20 text-orange-400 border-orange-500/30' };
      case 'MIXED_SIGNALS':
        return { label: '⚡ High Rigor / Popular', cls: 'bg-amber-400/20 text-amber-300 border-amber-400/40' };
      default:
        return { label: flag, cls: 'bg-zinc-800 text-zinc-300 border-zinc-700' };
    }
  };

  return (
    <div className="min-h-screen bg-[#0b0c0e] text-zinc-100 font-sans selection:bg-amber-400 selection:text-black pb-20">
      {/* Background ambient lighting in UMBC Gold */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none z-0">
        <div className="absolute -top-40 -left-40 w-96 h-96 bg-amber-500/15 rounded-full blur-3xl animate-pulse-glow"></div>
        <div className="absolute top-1/3 -right-40 w-96 h-96 bg-amber-400/10 rounded-full blur-3xl animate-pulse-glow"></div>
        <div className="absolute bottom-10 left-1/3 w-96 h-96 bg-amber-600/10 rounded-full blur-3xl animate-pulse-glow"></div>
      </div>

      <div className="relative z-10 max-w-6xl mx-auto px-4 sm:px-6 pt-10">
        {/* Header Bar */}
        <header className="flex flex-col md:flex-row md:items-center md:justify-between pb-8 border-b border-amber-500/20 gap-4">
          <div>
            <div className="flex items-center gap-3">
              <img src="/Logo.png" alt="GritRecon Logo" className="w-9 h-9 object-contain rounded-lg border border-amber-500/30 p-0.5 bg-amber-500/10 shadow-md shadow-amber-500/20" />
              <span className="px-2.5 py-1 text-xs font-black uppercase tracking-wider text-amber-400 bg-amber-500/10 rounded border border-amber-500/30">
                UMBC GritRecon v2.0
              </span>
              <span className="flex items-center gap-1.5 text-xs text-amber-400 bg-amber-400/10 px-2.5 py-1 rounded border border-amber-400/30 font-medium">
                <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse"></span>
                System Operational
              </span>
            </div>
            <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight mt-2 bg-gradient-to-r from-white via-amber-100 to-amber-400 bg-clip-text text-transparent">
              Faculty Command Center
            </h1>
            <p className="text-sm text-zinc-400 mt-1 max-w-xl">
              Official UMBC Black &amp; Gold faculty intelligence, grade distributions, and mixed review insights.
            </p>
          </div>
        </header>

        {/* Main Content Area */}
        <div className="mt-8 space-y-8">
          {/* Search Bar Container */}
          <div className="p-6 rounded-2xl glass-panel-glow">
            <label className="block text-xs font-black uppercase tracking-wider text-amber-400 mb-2">
              Faculty Intelligence Search
            </label>
            <div className="flex flex-col sm:flex-row gap-3">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && fetchIntel(searchQuery)}
                placeholder="Enter professor name (e.g. Kamran Fayyaz, Dinesh Verma, Jeremy Dixon)..."
                className="flex-1 bg-zinc-950/90 border border-amber-500/30 rounded-xl px-4 py-3 text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-amber-400 focus:ring-2 focus:ring-amber-400/20 transition"
              />
              <button
                onClick={() => fetchIntel(searchQuery)}
                disabled={loading}
                className="px-6 py-3 bg-gradient-to-r from-amber-400 to-amber-500 hover:from-amber-300 hover:to-amber-400 text-black text-sm font-black rounded-xl transition shadow-lg shadow-amber-400/30 disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {loading ? (
                  <>
                    <div className="w-4 h-4 border-2 border-black/30 border-t-black rounded-full animate-spin"></div>
                    Searching...
                  </>
                ) : (
                  <>
                    <span>🔍 Run Recon</span>
                  </>
                )}
              </button>
            </div>

            {/* Quick Presets */}
            <div className="flex flex-wrap items-center gap-2 mt-4 pt-3 border-t border-amber-500/20">
              <span className="text-xs text-zinc-400 font-medium">Quick Presets:</span>
              {['Kamran Fayyaz', 'Dinesh Verma', 'Jeremy Dixon', 'Richard Chang'].map((name) => (
                <button
                  key={name}
                  onClick={() => {
                    setSearchQuery(name);
                    fetchIntel(name);
                  }}
                  className="text-xs bg-zinc-900/80 hover:bg-amber-400 hover:text-black text-zinc-300 px-3 py-1 rounded-lg border border-amber-500/30 transition font-bold"
                >
                  {name}
                </button>
              ))}
            </div>
          </div>

          {/* Error Message */}
          {errorMsg && (
            <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm flex items-center gap-3">
              <span className="text-xl">⚠️</span>
              <div>
                <div className="font-bold">Recon Error</div>
                <div className="text-xs text-red-300/80">{errorMsg}</div>
              </div>
            </div>
          )}

          {/* Intel Results Display Card */}
          {reconData && (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Main Stats Panel */}
              <div className="lg:col-span-2 space-y-6">
                <div className="p-6 rounded-2xl glass-panel relative overflow-hidden">
                  <div className="flex flex-wrap items-start justify-between gap-4 pb-6 border-b border-amber-500/20">
                    <div>
                      <span className="text-xs font-black text-amber-400 uppercase tracking-widest">
                        Faculty Intel Profile
                      </span>
                      <h2 className="text-2xl font-bold text-white mt-1">{reconData.fullName}</h2>
                      <span className="text-xs text-zinc-400">UMBC Department • Gritview &amp; RMP Aggregated</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="text-right">
                        <div className="text-xs text-zinc-400 font-medium">UMBC Avg Grade</div>
                        <div className="text-lg font-black text-amber-400">
                          {reconData.averageGrade} {reconData.gpa ? `(${reconData.gpa.toFixed(2)} GPA)` : ''}
                        </div>
                      </div>
                      <button
                        onClick={() => fetchIntel(reconData.fullName, true)}
                        title="Force Refresh Data"
                        className="p-2.5 bg-zinc-900/80 hover:bg-zinc-800 text-zinc-300 rounded-xl border border-amber-500/30 transition"
                      >
                        🔄
                      </button>
                    </div>
                  </div>

                  {/* Metric Grid */}
                  <div className="grid grid-cols-3 gap-4 py-6">
                    <div className="p-4 rounded-xl bg-zinc-950/80 border border-amber-500/20 text-center">
                      <div className="text-xs text-zinc-400 font-bold uppercase tracking-wider">Difficulty</div>
                      <div className="text-2xl font-black text-amber-400 mt-1">
                        {reconData.difficulty > 0 ? `${reconData.difficulty}/5` : 'N/A'}
                      </div>
                    </div>
                    <div className="p-4 rounded-xl bg-zinc-950/80 border border-amber-500/20 text-center">
                      <div className="text-xs text-zinc-400 font-bold uppercase tracking-wider">Would Take Again</div>
                      <div className="text-2xl font-black text-zinc-100 mt-1">
                        {reconData.wouldTakeAgain !== -1 ? `${reconData.wouldTakeAgain}%` : 'N/A'}
                      </div>
                    </div>
                    <div className="p-4 rounded-xl bg-zinc-950/80 border border-amber-500/20 text-center">
                      <div className="text-xs text-zinc-400 font-bold uppercase tracking-wider">Pass Rate</div>
                      <div className="text-2xl font-black text-emerald-400 mt-1">
                        {reconData.passRate > 0 ? `${reconData.passRate}%` : 'N/A'}
                      </div>
                    </div>
                  </div>

                  {/* Grade Distribution */}
                  {reconData.gradeDistribution && (
                    <div className="pt-4 border-t border-amber-500/20">
                      <div className="flex justify-between items-center mb-2">
                        <span className="text-xs font-bold uppercase tracking-wider text-zinc-300">
                          Grade Distribution (Registrar Data)
                        </span>
                        <span className="text-xs text-zinc-400">Pass Rate: {reconData.passRate}%</span>
                      </div>
                      <div className="h-3 w-full bg-zinc-950 rounded-full overflow-hidden flex gap-0.5 p-0.5 border border-zinc-800">
                        <div
                          style={{ width: `${reconData.gradeDistribution.aPercent}%` }}
                          className="bg-emerald-500 h-full rounded-l-full transition-all"
                          title={`A: ${reconData.gradeDistribution.aPercent}%`}
                        ></div>
                        <div
                          style={{ width: `${reconData.gradeDistribution.bPercent}%` }}
                          className="bg-amber-400 h-full transition-all"
                          title={`B: ${reconData.gradeDistribution.bPercent}%`}
                        ></div>
                        <div
                          style={{ width: `${reconData.gradeDistribution.cPercent}%` }}
                          className="bg-amber-500 h-full transition-all"
                          title={`C: ${reconData.gradeDistribution.cPercent}%`}
                        ></div>
                        <div
                          style={{ width: `${reconData.gradeDistribution.dPercent}%` }}
                          className="bg-orange-500 h-full transition-all"
                          title={`D: ${reconData.gradeDistribution.dPercent}%`}
                        ></div>
                        <div
                          style={{ width: `${reconData.gradeDistribution.fPercent}%` }}
                          className="bg-red-500 h-full rounded-r-full transition-all"
                          title={`F: ${reconData.gradeDistribution.fPercent}%`}
                        ></div>
                      </div>
                      <div className="flex flex-wrap gap-4 text-xs text-zinc-400 mt-3">
                        <span>🟢 A: {reconData.gradeDistribution.aPercent}%</span>
                        <span>🟡 B: {reconData.gradeDistribution.bPercent}%</span>
                        <span>🟠 C: {reconData.gradeDistribution.cPercent}%</span>
                        <span>🔴 D: {reconData.gradeDistribution.dPercent}%</span>
                        <span>⛔ F: {reconData.gradeDistribution.fPercent}%</span>
                      </div>
                    </div>
                  )}
                </div>

                {/* Mixed Student Written Reviews */}
                <div className="p-6 rounded-2xl glass-panel space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-bold text-zinc-200 uppercase tracking-wider">
                      Balanced Student Reviews ({reconData.recentReviews?.length || 0})
                    </h3>
                    <span className="text-xs text-amber-400 font-bold bg-amber-400/10 px-2.5 py-0.5 rounded border border-amber-400/30">
                      Balanced Positive &amp; Critical Mix
                    </span>
                  </div>
                  <div className="space-y-3 max-h-[500px] overflow-y-auto pr-2">
                    {reconData.recentReviews && reconData.recentReviews.length > 0 ? (
                      reconData.recentReviews.map((rev, idx) => (
                        <div key={idx} className="p-4 rounded-xl bg-zinc-950/80 border border-amber-500/20 space-y-2">
                          <div className="flex justify-between items-center text-xs">
                            <span className="font-bold text-amber-400 uppercase tracking-wider">{rev.source}</span>
                            <span className="text-zinc-400 font-medium">Grade Received: {rev.gradeReceived}</span>
                          </div>
                          <p className="text-sm text-zinc-300 italic">&quot;{rev.text}&quot;</p>
                        </div>
                      ))
                    ) : (
                      <div className="text-center py-6 text-zinc-500 text-sm">No written reviews recorded for this professor.</div>
                    )}
                  </div>
                </div>
              </div>

              {/* Sidebar: Student Risk Matrix & Extension Live Overlay Preview */}
              <div className="space-y-6">
                {/* Risk Matrix Box */}
                <div className="p-6 rounded-2xl glass-panel space-y-3">
                  <h3 className="text-xs font-black text-amber-400 uppercase tracking-wider">
                    Student Risk Matrix
                  </h3>
                  <p className="text-xs text-zinc-400">
                    Automatic edge-case detection comparing grade distributions against student ratings.
                  </p>

                  <div className="space-y-2 pt-2">
                    {reconData.riskFlags && reconData.riskFlags.length > 0 ? (
                      reconData.riskFlags.map((flag) => {
                        const badge = getRiskBadge(flag);
                        return (
                          <div
                            key={flag}
                            className={`p-3 rounded-xl border text-xs font-semibold flex items-center justify-between ${badge.cls}`}
                          >
                            <span>{badge.label}</span>
                            <span className="text-[10px] opacity-75">Active Flag</span>
                          </div>
                        );
                      })
                    ) : (
                      <div className="p-3 rounded-xl bg-amber-400/10 border border-amber-400/30 text-amber-400 text-xs font-medium">
                        ✅ Clean Record: No high-risk edge cases detected.
                      </div>
                    )}
                  </div>
                </div>

                {/* Chrome Extension Overlay Simulator */}
                <div className="p-6 rounded-2xl glass-panel-glow space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="text-xs font-black text-amber-400 uppercase tracking-wider">
                      Extension Overlay Preview
                    </h3>
                    <span className="text-[10px] bg-amber-400/20 text-amber-300 px-2 py-0.5 rounded border border-amber-400/40 font-bold">
                      UMBC Gold
                    </span>
                  </div>

                  {/* Simulated Popover */}
                  <div className="p-5 rounded-2xl bg-[#0b0c0e] border border-amber-400/40 shadow-2xl text-xs space-y-3.5 max-w-[430px]">
                    <div className="flex justify-between items-center pb-3 border-b border-amber-500/20">
                      <div>
                        <div className="font-extrabold text-white text-base">{reconData.fullName}</div>
                        <div className="text-xs text-zinc-400">UMBC Faculty Intel</div>
                      </div>
                      <div className="text-right" title="Historical Average Grade & GPA awarded by this professor at UMBC">
                        <div className="text-[10px] font-black text-amber-400 tracking-wider uppercase">AVG GRADE</div>
                        <div className="px-3 py-1 bg-gradient-to-r from-amber-400 to-amber-500 text-black font-black rounded-full text-xs shadow-md shadow-amber-500/30 inline-block">
                          {reconData.averageGrade} {reconData.gpa ? `(${reconData.gpa.toFixed(2)})` : ''}
                        </div>
                      </div>
                    </div>

                    <div className="grid grid-cols-3 gap-2 bg-zinc-950/90 p-3 rounded-xl text-center border border-amber-500/20">
                      <div title="Course difficulty rated 1 (Very Easy) to 5 (Extremely Hard)">
                        <div className="text-[10px] text-zinc-400 font-extrabold uppercase">Difficulty ℹ️</div>
                        <div className="font-black text-amber-400 text-sm mt-0.5">{reconData.difficulty > 0 ? `${reconData.difficulty}/5` : 'N/A'}</div>
                      </div>
                      <div title="Percentage of surveyed students who would take another class with this instructor">
                        <div className="text-[10px] text-zinc-400 font-extrabold uppercase">Take Again ℹ️</div>
                        <div className="font-black text-zinc-100 text-sm mt-0.5">{reconData.wouldTakeAgain !== -1 ? `${reconData.wouldTakeAgain}%` : 'N/A'}</div>
                      </div>
                      <div title="Percentage of students earning a passing grade (C or higher) in UMBC registrar records">
                        <div className="text-[10px] text-zinc-400 font-extrabold uppercase">Pass Rate ℹ️</div>
                        <div className="font-black text-emerald-400 text-sm mt-0.5">{reconData.passRate > 0 ? `${reconData.passRate}%` : 'N/A'}</div>
                      </div>
                    </div>

                    <div className="p-2.5 rounded-lg bg-amber-400/10 border border-amber-400/25 text-[11px] text-amber-300 flex items-start gap-1.5 leading-snug">
                      <span>💡</span>
                      <span><strong>Student Tip:</strong> Avg Grade shows the historical grade (and 4.0 scale GPA) awarded by this professor at UMBC.</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

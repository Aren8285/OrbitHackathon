import Link from 'next/link';

export default function HomePage() {
  return (
    <div className="relative flex min-h-screen flex-col bg-risk-bg-primary">
      {/* subtle gradient wash */}
      <div className="pointer-events-none fixed inset-0 -z-10 bg-gradient-to-br from-transparent via-transparent to-blue-950/30" />

      <main className="flex min-h-0 flex-1 items-center justify-center px-6 py-16">
        <div className="w-full max-w-4xl text-center">
          {/* badge */}
          <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-cyan-500/20 bg-cyan-500/5 px-4 py-1.5 text-xs font-medium uppercase tracking-widest text-cyan-300">
            <span className="h-1.5 w-1.5 rounded-full bg-cyan-400 animate-pulse" />
            RiskOps Demo · Cyber Risk Dashboard
          </div>

          <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">
            RiskOps
            <br />
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-cyan-300 to-blue-400">
              Executive Cyber Risk Dashboard
            </span>
          </h1>

          <p className="mx-auto mt-5 max-w-2xl text-lg text-slate-400">
            Portfolio-level loss exposure, asset risk, vulnerability rankings, Monte
            Carlo scenarios and control budget optimization — powered by the backend
            risk engine.
          </p>

          <div className="mx-auto mt-8 flex flex-wrap justify-center gap-3">
            <Link
              href="/"
              className="inline-flex items-center gap-2 rounded-xl border border-cyan-500/30 bg-gradient-to-r from-cyan-500/10 to-blue-500/10 px-5 py-2.5 text-sm font-medium text-cyan-200 transition-all hover:from-cyan-500/20 hover:to-blue-500/20 hover:border-cyan-400/50 hover:shadow-[0_0_18px_rgba(34,211,238,0.25)]"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"
                />
              </svg>
              Executive Dashboard
            </Link>

            <Link
              href="/scenarios"
              className="inline-flex items-center gap-2 rounded-xl border border-slate-700/50 bg-slate-800/60 px-5 py-2.5 text-sm font-medium text-slate-300 transition-all hover:border-cyan-500/30 hover:text-cyan-300 hover:bg-slate-800"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
                />
              </svg>
              Risk Scenario
            </Link>

            <Link
              href="/assets"
              className="inline-flex items-center gap-2 rounded-xl border border-slate-700/50 bg-slate-800/60 px-5 py-2.5 text-sm font-medium text-slate-300 transition-all hover:border-cyan-500/30 hover:text-cyan-300 hover:bg-slate-800"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4"
                />
              </svg>
              Assets
            </Link>
          </div>

          <p className="mt-9 text-xs text-slate-600">
            Backend must be running on{' '}
            <code className="rounded bg-slate-800 px-1.5 py-0.5 text-cyan-300 text-[0.7rem]">
              localhost:8000
            </code>{' '}
            for live data to appear.
          </p>
        </div>
      </main>

      {/* footer */}
      <footer className="border-t border-slate-700/30 py-4">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-6 text-xs text-slate-600">
          <span>RiskOps Demo</span>
          <span className="hidden sm:inline">Built for the RiskOps hackathon</span>
        </div>
      </footer>
    </div>
  );
}

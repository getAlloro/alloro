import Lottie from "lottie-react";
import cogitatingSpinner from "../../../assets/cogitating-spinner.json";

export function RankingsLoadingState() {
  return (
    <div className="min-h-screen bg-alloro-bg font-body text-alloro-textDark pb-32 selection:bg-alloro-orange selection:text-white">
      <main className="w-full max-w-[1320px] mx-auto px-6 lg:px-10 py-8 lg:py-10 space-y-6">
        <div
          role="status"
          aria-label="Loading rankings"
          className="flex items-center justify-center py-5"
        >
          <div
            aria-hidden="true"
            className="relative flex h-16 w-16 items-center justify-center"
          >
            <div className="absolute inset-0 animate-spin rounded-full border-[3px] border-alloro-orange/15 border-t-alloro-orange [animation-duration:1.2s]" />
            <Lottie
              animationData={cogitatingSpinner}
              loop
              className="relative z-10 h-9 w-9"
            />
          </div>
        </div>
        <RankingsLoadingSkeleton />
      </main>
    </div>
  );
}

function RankingsLoadingSkeleton() {
  return (
    <div className="space-y-5 lg:space-y-6 animate-pulse">
      <section className="rounded-[14px] border border-[#EDE5C0] bg-[#FCFAED] px-5 py-4 lg:px-6 lg:py-5">
        <div className="mb-3 h-3 w-36 rounded-full bg-[#E7DEC1]" />
        <div className="h-3 w-full rounded-full bg-[#E7DEC1]" />
        <div className="mt-2 h-3 w-[78%] rounded-full bg-[#E7DEC1]" />
      </section>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1.35fr_1fr] lg:gap-5">
        <div className="rounded-[14px] border border-line-soft bg-white p-7 shadow-premium lg:p-9">
          <div className="mb-8 flex items-center justify-between gap-4">
            <div className="h-4 w-44 rounded-full bg-slate-200" />
            <div className="h-3 w-28 rounded-full bg-slate-200" />
          </div>
          <div className="flex items-end gap-6">
            <div className="h-24 w-40 rounded-xl bg-slate-200" />
            <div className="space-y-3 pb-4">
              <div className="h-4 w-24 rounded-full bg-slate-200" />
              <div className="h-3 w-56 rounded-full bg-slate-200" />
            </div>
          </div>
          <div className="mt-8 grid grid-cols-2 gap-4 border-t border-line-soft pt-5">
            <div className="space-y-2">
              <div className="h-3 w-24 rounded-full bg-slate-200" />
              <div className="h-8 w-16 rounded-lg bg-slate-200" />
            </div>
            <div className="space-y-2">
              <div className="h-3 w-20 rounded-full bg-slate-200" />
              <div className="h-8 w-20 rounded-lg bg-slate-200" />
            </div>
          </div>
        </div>

        <div className="rounded-[14px] border border-line-soft bg-white p-7 shadow-premium lg:p-9">
          <div className="mb-8 h-4 w-40 rounded-full bg-slate-200" />
          <div className="mx-auto h-28 w-44 rounded-t-full bg-slate-200" />
          <div className="mx-auto mt-4 h-3 w-52 rounded-full bg-slate-200" />
          <div className="mx-auto mt-8 h-px w-full bg-slate-100" />
          <div className="mx-auto mt-4 h-3 w-44 rounded-full bg-slate-200" />
        </div>
      </div>

      <section className="rounded-[14px] border border-line-soft bg-white px-6 py-5 shadow-premium">
        <div className="mb-5 flex items-center justify-between">
          <div className="h-4 w-36 rounded-full bg-slate-200" />
          <div className="h-3 w-48 rounded-full bg-slate-200" />
        </div>
        <div className="h-32 w-full rounded-xl bg-slate-100" />
      </section>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1.35fr_1fr] lg:gap-6">
        <div className="space-y-5 lg:space-y-6">
          {[...Array(3)].map((_, index) => (
            <div
              key={index}
              className="rounded-[14px] border border-line-soft bg-white p-6 shadow-premium"
            >
              <div className="mb-5 h-4 w-44 rounded-full bg-slate-200" />
              <div className="space-y-3">
                <div className="h-3 w-full rounded-full bg-slate-100" />
                <div className="h-3 w-[86%] rounded-full bg-slate-100" />
                <div className="h-3 w-[64%] rounded-full bg-slate-100" />
              </div>
            </div>
          ))}
        </div>
        <div className="space-y-5 lg:space-y-6">
          {[...Array(2)].map((_, index) => (
            <div
              key={index}
              className="rounded-[14px] border border-line-soft bg-white p-6 shadow-premium"
            >
              <div className="mb-5 h-4 w-40 rounded-full bg-slate-200" />
              <div className="space-y-3">
                <div className="h-9 rounded-xl bg-slate-100" />
                <div className="h-9 rounded-xl bg-slate-100" />
                <div className="h-9 rounded-xl bg-slate-100" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

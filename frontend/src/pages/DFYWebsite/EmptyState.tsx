import { Sparkles } from "lucide-react";

export function EmptyState() {
  return (
    <div className="min-h-screen bg-alloro-bg font-body flex items-center justify-center py-16 px-6">
      <div className="max-w-xl w-full text-center">
        {/* Animated building blocks */}
        <div className="flex items-end justify-center gap-2 mb-8 h-20">
          <div className="w-5 rounded-t-md bg-alloro-orange/60 animate-[grow1_1.5s_ease-in-out_infinite]" />
          <div className="w-5 rounded-t-md bg-alloro-orange/80 animate-[grow2_1.5s_ease-in-out_infinite_0.2s]" />
          <div className="w-5 rounded-t-md bg-alloro-orange animate-[grow3_1.5s_ease-in-out_infinite_0.4s]" />
          <div className="w-5 rounded-t-md bg-alloro-orange/80 animate-[grow2_1.5s_ease-in-out_infinite_0.6s]" />
          <div className="w-5 rounded-t-md bg-alloro-orange/60 animate-[grow1_1.5s_ease-in-out_infinite_0.8s]" />
        </div>

        <div className="inline-flex items-center gap-2 px-4 py-2 bg-alloro-orange/10 rounded-full mb-4">
          <Sparkles className="w-4 h-4 text-alloro-orange" />
          <span className="text-xs font-bold text-alloro-orange uppercase tracking-wider">
            Almost There
          </span>
        </div>
        <h1 className="font-display text-2xl md:text-3xl font-medium text-alloro-navy tracking-tight mb-3">
          Your Website is Being Built
        </h1>
        <p className="text-base text-slate-500 font-medium max-w-md mx-auto">
          Your project has been created and Alloro is setting up your pages.
          You'll be able to edit them here once they're ready.
        </p>
      </div>

      <style>{`
        @keyframes grow1 {
          0%, 100% { height: 24px; }
          50% { height: 56px; }
        }
        @keyframes grow2 {
          0%, 100% { height: 32px; }
          50% { height: 72px; }
        }
        @keyframes grow3 {
          0%, 100% { height: 40px; }
          50% { height: 80px; }
        }
      `}</style>
    </div>
  );
}

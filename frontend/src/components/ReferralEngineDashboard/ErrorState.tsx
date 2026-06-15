export const ErrorState = ({ error }: { error: string }) => {
  return (
    <div className="min-h-screen bg-alloro-bg font-body text-alloro-textDark pb-32">
      <div className="max-w-[1400px] mx-auto relative flex flex-col">
        <div className="py-32 px-6">
          <div className="bg-red-50 border border-red-200 rounded-2xl p-10 text-center max-w-lg mx-auto">
            <p className="text-red-600 font-black text-lg mb-2">
              Failed to load data
            </p>
            <p className="text-red-500 text-sm mb-6">{error}</p>
            <button
              onClick={() => window.location.reload()}
              className="px-6 py-3 bg-red-600 text-white rounded-xl font-black text-sm uppercase tracking-widest hover:bg-red-700 transition-colors"
            >
              Retry
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

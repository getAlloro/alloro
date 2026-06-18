export const LoadingState = () => {
  return (
    <div className="min-h-screen bg-alloro-bg font-body text-alloro-textDark pb-32">
      <div className="max-w-[1400px] mx-auto relative flex flex-col">
        <div className="flex items-center justify-center py-32">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-alloro-orange mx-auto mb-4"></div>
            <p className="text-slate-500 font-bold">
              Loading revenue attribution data...
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

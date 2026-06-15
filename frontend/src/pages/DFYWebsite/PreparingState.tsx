export function PreparingState() {
  return (
    <div className="flex items-center justify-center h-screen">
      <div className="text-center max-w-md">
        <div className="animate-spin w-12 h-12 border-4 border-alloro-orange border-t-transparent rounded-full mx-auto mb-4" />
        <h2 className="font-display text-xl font-medium text-alloro-navy mb-2">
          Your Website is Being Prepared
        </h2>
        <p className="text-gray-600">
          We're setting up your website. You'll receive an email when it's
          ready!
        </p>
      </div>
    </div>
  );
}

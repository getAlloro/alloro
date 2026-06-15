import { AdminTopBar } from "../../../components/Admin/shell/AdminTopBar";
import { AdminSidebar } from "../../../components/Admin/shell/AdminSidebar";
import { LoadingIndicator } from "../../../components/Admin/shell/LoadingIndicator";

export function EditorLoadingSkeleton() {
  return (
    <div className="h-screen flex flex-col bg-gray-50 overflow-hidden">
      {/* Topbar loading indicator */}
      <LoadingIndicator />
      <AdminTopBar />
      <AdminSidebar />

      {/* Loading skeleton that matches editor layout */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left sidebar skeleton */}
        <div className="w-80 bg-white border-r border-gray-200 flex flex-col">
          <div className="p-4 border-b border-gray-200">
            <div className="h-8 bg-gray-200 rounded animate-pulse"></div>
          </div>
          <div className="flex-1 p-4 space-y-3">
            <div className="h-4 bg-gray-200 rounded animate-pulse"></div>
            <div className="h-4 bg-gray-200 rounded animate-pulse w-3/4"></div>
            <div className="h-4 bg-gray-200 rounded animate-pulse w-1/2"></div>
          </div>
        </div>

        {/* Center preview skeleton */}
        <div className="flex-1 bg-gray-100 p-4 flex items-center justify-center">
          <div className="w-full h-full max-w-6xl bg-white rounded-xl shadow-lg border border-gray-200 animate-pulse"></div>
        </div>

        {/* Right sidebar skeleton */}
        <div className="w-96 bg-white border-l border-gray-200 flex flex-col">
          <div className="p-4 border-b border-gray-200">
            <div className="h-8 bg-gray-200 rounded animate-pulse"></div>
          </div>
          <div className="flex-1 p-4 space-y-3">
            <div className="h-20 bg-gray-200 rounded animate-pulse"></div>
            <div className="h-4 bg-gray-200 rounded animate-pulse"></div>
            <div className="h-4 bg-gray-200 rounded animate-pulse w-2/3"></div>
          </div>
        </div>
      </div>
    </div>
  );
}

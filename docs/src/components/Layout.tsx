import { useState } from "react";
import { Outlet } from "react-router-dom";
import { Sidebar } from "./Sidebar";
import { TopBar } from "./TopBar";

export function Layout() {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="min-h-screen flex bg-alloro-cream">
      <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <div className="flex-1 flex flex-col min-w-0 lg:ml-72">
        <TopBar onMenuClick={() => setSidebarOpen(true)} />
        <main className="flex-1 px-6 py-8 lg:px-10 max-w-[1100px]">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

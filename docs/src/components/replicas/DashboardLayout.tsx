import { AlloroSidebar } from "./AlloroSidebar";

interface DashboardLayoutProps {
  activeItem: string;
  children: React.ReactNode;
  /** Extra classes on the content pane (e.g. "flex flex-col" for full-bleed editors). */
  contentClassName?: string;
}

export function DashboardLayout({
  activeItem,
  children,
  contentClassName = "",
}: DashboardLayoutProps) {
  return (
    <div
      className="flex w-[1440px] overflow-hidden"
      style={{ height: "var(--viewport-h, 900px)" }}
    >
      <AlloroSidebar activeItem={activeItem} />
      <div
        className={`flex-1 min-w-0 overflow-y-auto overflow-x-hidden bg-white px-6 py-6 ${contentClassName}`}
      >
        {children}
      </div>
    </div>
  );
}

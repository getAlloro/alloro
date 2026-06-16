import { useState, useEffect, useRef } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Link, useLocation } from "react-router-dom";
import {
  ChevronDown,
  LogOut,
  User,
  RefreshCw,
  Layers,
  FolderKanban,
  LifeBuoy,
} from "lucide-react";
import { queryClient } from "../../../lib/queryClient";
import { toast } from "react-hot-toast";

// eslint-disable-next-line react-refresh/only-export-components
export function useIsPmRoute() {
  const location = useLocation();
  return location.pathname.startsWith("/admin/pm");
}

// eslint-disable-next-line react-refresh/only-export-components
export function useIsSupportRoute() {
  const location = useLocation();
  return location.pathname.startsWith("/admin/support");
}

function getAdminDisplayName(): string {
  try {
    const token = localStorage.getItem("auth_token");
    if (!token) return "Admin Account";
    const payload = JSON.parse(atob(token.split(".")[1]));
    const email: string = payload.email || "";
    const name = email.split("@")[0];
    return name
      ? name.charAt(0).toUpperCase() + name.slice(1)
      : "Admin Account";
  } catch {
    return "Admin Account";
  }
}

export function AdminTopBar() {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const isPm = useIsPmRoute();
  const isSupport = useIsSupportRoute();
  const isProcess = !isPm && !isSupport;
  const displayName = getAdminDisplayName();

  const toggleMenu = () => setIsMenuOpen((value) => !value);

  const handleLogoutClick = () => {
    setIsMenuOpen(false);
    setShowLogoutConfirm(true);
  };

  const handleLogout = () => {
    // Clear admin authentication tokens
    localStorage.removeItem("auth_token");
    localStorage.removeItem("user_role");

    // Clear cookie with shared domain for cross-app auth sync
    const isProduction = window.location.hostname.includes("getalloro.com");
    const domain = isProduction ? "; domain=.getalloro.com" : "";
    document.cookie = `auth_token=; path=/; max-age=0${domain}`;

    // Broadcast logout event to other tabs (same-origin only, but shared cookie handles cross-domain)
    try {
      const channel = new BroadcastChannel("auth_channel");
      channel.postMessage({ type: "logout" });
      channel.close();
    } catch {
      // BroadcastChannel not supported
    }

    // Redirect to admin login
    window.location.href = "/admin";
  };

  // Close menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsMenuOpen(false);
      }
    };

    if (isMenuOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isMenuOpen]);

  return (
    <>
      <nav className="bg-[#212D40] border-b border-gray-700 sticky top-0 z-50 shadow-sm">
        <div className="py-0 px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16 items-center">
            {/* Logo and Brand */}
            <div className="flex items-center">
              <Link
                to="/admin/mission-control"
                className="flex items-center gap-3"
              >
                <motion.div
                  whileHover={{ scale: 1.05 }}
                  transition={{ duration: 0.2 }}
                >
                  <img
                    src="/logo.png"
                    alt="Alloro Logo"
                    width={40}
                    height={40}
                    className="rounded-xl"
                  />
                </motion.div>
                <span className="font-bold text-xl text-white">
                  <span className="text-alloro-orange">Alloro</span> Admin Hub
                </span>
              </Link>
            </div>

            {/* User Menu */}
            <div className="relative" ref={menuRef}>
              <motion.button
                type="button"
                onClick={toggleMenu}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                className="flex items-center gap-3 rounded-xl border border-gray-600 bg-[#2a3a52] px-4 py-2 text-sm font-medium transition-all hover:border-alloro-orange/30 hover:shadow-md"
              >
                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-alloro-orange/20 to-alloro-orange/10 text-alloro-orange">
                  <User className="h-4 w-4" />
                </span>
                <div className="flex flex-col items-start">
                  <span className="text-sm font-semibold text-white">
                    {displayName}
                  </span>
                </div>
                <ChevronDown
                  className={`h-4 w-4 text-gray-400 transition-transform ${
                    isMenuOpen ? "rotate-180" : ""
                  }`}
                />
              </motion.button>
              <AnimatePresence>
                {isMenuOpen && (
                  <motion.div
                    initial={{ opacity: 0, y: -8, scale: 0.96 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: -8, scale: 0.96 }}
                    transition={{ duration: 0.15 }}
                    className="absolute right-0 mt-2 w-48 overflow-hidden rounded-xl border border-gray-600 bg-[#2a3a52] shadow-lg"
                  >
                    <button
                      type="button"
                      onClick={() => {
                        queryClient.invalidateQueries();
                        queryClient.clear();
                        setIsMenuOpen(false);
                        toast.success("Cache purged — all data will refetch");
                      }}
                      className="flex w-full items-center gap-3 px-4 py-3 text-left text-sm font-medium text-gray-300 transition hover:bg-gray-700/50 hover:text-white"
                    >
                      <RefreshCw className="h-4 w-4" />
                      Purge Cache
                    </button>
                    <button
                      type="button"
                      onClick={handleLogoutClick}
                      className="flex w-full items-center gap-3 px-4 py-3 text-left text-sm font-medium text-gray-300 transition hover:bg-red-900/30 hover:text-red-400"
                    >
                      <LogOut className="h-4 w-4" />
                      Log out
                    </button>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>
        </div>
      </nav>

      {/* Tab Bar: Process / Projects */}
      <div className="bg-[#1a2535] border-b border-gray-700/50 sticky top-16 z-40">
        <div className="px-4 sm:px-6 lg:px-8 flex gap-0">
          <Link
            to="/admin/mission-control"
            className={`relative flex items-center gap-2 px-5 py-2.5 text-[13px] transition-colors duration-150 ${
              isProcess ? "text-[#D66853]" : "text-gray-400 hover:text-gray-200"
            }`}
          >
            <Layers className="h-4 w-4" strokeWidth={1.5} />
            <span className={isProcess ? "font-semibold" : "font-medium"}>
              Process
            </span>
            {isProcess && (
              <motion.div
                layoutId="tab-underline"
                className="absolute bottom-0 left-2 right-2 h-[2px] bg-[#D66853] rounded-full"
                transition={{ duration: 0.2, ease: "easeOut" }}
              />
            )}
          </Link>
          <Link
            to="/admin/pm"
            className={`relative flex items-center gap-2 px-5 py-2.5 text-[13px] transition-colors duration-150 ${
              isPm ? "text-[#D66853]" : "text-gray-400 hover:text-gray-200"
            }`}
          >
            <FolderKanban className="h-4 w-4" strokeWidth={1.5} />
            <span className={isPm ? "font-semibold" : "font-medium"}>
              Projects
            </span>
            {isPm && (
              <motion.div
                layoutId="tab-underline"
                className="absolute bottom-0 left-2 right-2 h-[2px] bg-[#D66853] rounded-full"
                transition={{ duration: 0.2, ease: "easeOut" }}
              />
            )}
          </Link>
          <Link
            to="/admin/support"
            className={`relative flex items-center gap-2 px-5 py-2.5 text-[13px] transition-colors duration-150 ${
              isSupport ? "text-[#D66853]" : "text-gray-400 hover:text-gray-200"
            }`}
          >
            <LifeBuoy className="h-4 w-4" strokeWidth={1.5} />
            <span className={isSupport ? "font-semibold" : "font-medium"}>
              Support
            </span>
            {isSupport && (
              <motion.div
                layoutId="tab-underline"
                className="absolute bottom-0 left-2 right-2 h-[2px] bg-[#D66853] rounded-full"
                transition={{ duration: 0.2, ease: "easeOut" }}
              />
            )}
          </Link>
        </div>
      </div>

      {/* Logout Confirmation Modal */}
      <AnimatePresence>
        {showLogoutConfirm && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-gray-900/30 backdrop-blur-sm p-4"
            onClick={() => setShowLogoutConfirm(false)}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 20 }}
              transition={{
                duration: 0.2,
                type: "spring",
                stiffness: 300,
                damping: 25,
              }}
              className="w-full max-w-sm rounded-2xl border border-gray-100 bg-white p-6 shadow-xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="text-center mb-6">
                <motion.div
                  className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-red-100 to-red-50"
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ delay: 0.1, type: "spring", stiffness: 300 }}
                >
                  <LogOut className="h-7 w-7 text-red-500" />
                </motion.div>
                <h3 className="text-xl font-bold text-gray-900 mb-2">
                  Log Out?
                </h3>
                <p className="text-sm text-gray-500">
                  You'll need to sign in again to access the admin panel.
                </p>
              </div>
              <div className="flex gap-3">
                <motion.button
                  type="button"
                  onClick={() => setShowLogoutConfirm(false)}
                  className="flex-1 rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm font-semibold text-gray-700 transition-all hover:bg-gray-50 hover:border-gray-300"
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                >
                  Cancel
                </motion.button>
                <motion.button
                  type="button"
                  onClick={handleLogout}
                  className="flex-1 rounded-xl bg-alloro-orange px-4 py-3 text-sm font-semibold text-white transition-all hover:bg-alloro-orange/90 shadow-lg shadow-alloro-orange/30 hover:shadow-xl hover:shadow-alloro-orange/40"
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                >
                  Log Out
                </motion.button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

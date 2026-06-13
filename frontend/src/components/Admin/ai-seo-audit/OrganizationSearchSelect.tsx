import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Check, ChevronDown, Search } from "lucide-react";
import type { AdminOrganization } from "../../../api/admin-organizations";

export type OrganizationSearchSelectProps = {
  organizations: AdminOrganization[];
  selectedOrgId: number | null;
  isLoading: boolean;
  onChange: (organizationId: number) => void;
};

function getDomain(organization: AdminOrganization): string {
  return organization.domain || "No domain";
}

function getSearchText(organization: AdminOrganization): string {
  return `${organization.name} ${organization.domain || ""}`.toLowerCase();
}

function getDisplayLabel(organization: AdminOrganization): string {
  return organization.domain
    ? `${organization.name} - ${organization.domain}`
    : organization.name;
}

export function OrganizationSearchSelect({
  organizations,
  selectedOrgId,
  isLoading,
  onChange,
}: OrganizationSearchSelectProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [highlight, setHighlight] = useState(0);
  const wrapRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const selectedOrganization = organizations.find(
    (organization) => organization.id === selectedOrgId
  );
  const disabled = isLoading || organizations.length === 0;

  const filteredOrganizations = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) return organizations;
    return organizations.filter((organization) =>
      getSearchText(organization).includes(normalizedQuery)
    );
  }, [organizations, query]);

  useEffect(() => {
    if (!open) return;
    setHighlight(0);
    window.requestAnimationFrame(() => inputRef.current?.focus());
  }, [open, query]);

  useEffect(() => {
    if (!open) return;
    const handleClickAway = (event: MouseEvent) => {
      if (!wrapRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handleClickAway);
    return () => document.removeEventListener("mousedown", handleClickAway);
  }, [open]);

  const handleSelect = (organizationId: number) => {
    onChange(organizationId);
    setOpen(false);
    setQuery("");
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!open) return;
    if (event.key === "Escape") {
      event.preventDefault();
      setOpen(false);
      return;
    }
    if (filteredOrganizations.length === 0) return;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setHighlight((current) => (current + 1) % filteredOrganizations.length);
      return;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      setHighlight(
        (current) =>
          (current - 1 + filteredOrganizations.length) %
          filteredOrganizations.length
      );
      return;
    }
    if (event.key === "Enter") {
      event.preventDefault();
      const organization = filteredOrganizations[highlight];
      if (organization) handleSelect(organization.id);
    }
  };

  return (
    <div
      ref={wrapRef}
      className="relative min-w-0 flex-1"
      onKeyDown={handleKeyDown}
    >
      <button
        type="button"
        disabled={disabled}
        aria-expanded={open}
        aria-haspopup="listbox"
        onClick={() => setOpen((current) => !current)}
        className="flex min-h-10 w-full items-center justify-between gap-3 rounded-xl border border-gray-200 bg-gray-50 px-3 text-left text-sm font-bold text-alloro-navy transition-all duration-200 hover:border-alloro-orange/30 hover:bg-white focus:border-alloro-orange focus:bg-white focus:outline-none focus:ring-2 focus:ring-alloro-orange/20 disabled:cursor-not-allowed disabled:opacity-60"
      >
        <span className="min-w-0 truncate">
          {isLoading
            ? "Loading organizations"
            : selectedOrganization
              ? getDisplayLabel(selectedOrganization)
              : "Select organization"}
        </span>
        <motion.span
          animate={{ rotate: open ? 180 : 0 }}
          transition={{ duration: 0.16, ease: "easeOut" }}
          className="shrink-0 text-gray-400"
        >
          <ChevronDown className="h-4 w-4" />
        </motion.span>
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -6, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.98 }}
            transition={{ duration: 0.14, ease: "easeOut" }}
            className="absolute left-0 right-0 z-50 mt-2 overflow-hidden rounded-xl border border-gray-200 bg-white shadow-xl"
          >
            <div className="relative border-b border-gray-100 p-2">
              <Search className="pointer-events-none absolute left-5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
              <input
                ref={inputRef}
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search organizations"
                className="min-h-10 w-full rounded-lg border border-gray-200 bg-gray-50 pl-9 pr-3 text-sm font-semibold text-alloro-navy outline-none transition focus:border-alloro-orange focus:bg-white focus:ring-2 focus:ring-alloro-orange/20"
              />
            </div>

            <ul className="max-h-72 overflow-y-auto p-1" role="listbox">
              {filteredOrganizations.length === 0 ? (
                <li className="px-3 py-4 text-sm font-semibold text-gray-500">
                  No organizations found
                </li>
              ) : (
                filteredOrganizations.map((organization, index) => {
                  const selected = organization.id === selectedOrgId;
                  const highlighted = index === highlight;
                  return (
                    <li key={organization.id} role="option" aria-selected={selected}>
                      <button
                        type="button"
                        onClick={() => handleSelect(organization.id)}
                        onMouseEnter={() => setHighlight(index)}
                        className={`flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2 text-left transition-colors ${
                          highlighted ? "bg-alloro-orange/10" : "hover:bg-gray-50"
                        }`}
                      >
                        <span className="min-w-0">
                          <span className="block truncate text-sm font-black text-alloro-navy">
                            {organization.name}
                          </span>
                          <span className="block truncate text-xs font-semibold text-gray-500">
                            {getDomain(organization)}
                          </span>
                        </span>
                        {selected && (
                          <Check className="h-4 w-4 shrink-0 text-alloro-orange" />
                        )}
                      </button>
                    </li>
                  );
                })
              )}
            </ul>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

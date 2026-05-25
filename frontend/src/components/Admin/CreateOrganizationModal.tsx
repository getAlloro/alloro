import { useState } from "react";
import type { ReactNode } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Plus, X } from "lucide-react";
import { toast } from "react-hot-toast";
import {
  adminCreateOrganization,
  type AdminCreateOrgInput,
} from "../../api/admin-organizations";

export type CreateOrganizationModalProps = {
  open: boolean;
  onClose: () => void;
  onCreated: () => void | Promise<void>;
};

const EMPTY_CREATE_FORM: AdminCreateOrgInput = {
  organization: { name: "", domain: "", address: "" },
  user: { email: "", password: "", firstName: "", lastName: "" },
  location: { name: "", address: "" },
};

export function CreateOrganizationModal({
  open,
  onClose,
  onCreated,
}: CreateOrganizationModalProps) {
  const [form, setForm] = useState<AdminCreateOrgInput>(EMPTY_CREATE_FORM);
  const [isCreating, setIsCreating] = useState(false);

  const resetAndClose = () => {
    setForm(EMPTY_CREATE_FORM);
    onClose();
  };

  const handleCreate = async () => {
    if (!form.organization.name.trim()) {
      toast.error("Organization name is required");
      return;
    }
    if (!form.user.email.trim()) {
      toast.error("User email is required");
      return;
    }
    if (!form.user.password) {
      toast.error("Password is required");
      return;
    }

    setIsCreating(true);
    try {
      const response = await adminCreateOrganization(form);
      if (!response.success) {
        toast.error("Failed to create organization");
        return;
      }
      toast.success(response.message || "Organization created");
      resetAndClose();
      await onCreated();
    } catch (error: unknown) {
      toast.error(getCreateErrorMessage(error));
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={resetAndClose}
        >
          <motion.div
            className="mx-4 max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-8 shadow-2xl"
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            onClick={(event) => event.stopPropagation()}
          >
            <div className="mb-6 flex items-center justify-between">
              <h2 className="text-xl font-black tracking-tight text-alloro-navy">
                Create Organization
              </h2>
              <button
                onClick={resetAndClose}
                className="rounded-lg p-2 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600"
                aria-label="Close create organization modal"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-6">
              <FieldGroup title="Organization">
                <TextField
                  label="Name"
                  required
                  value={form.organization.name}
                  onChange={(name) =>
                    setForm((prev) => ({
                      ...prev,
                      organization: { ...prev.organization, name },
                    }))
                  }
                  placeholder="e.g. Dr. Smith Dental Practice"
                />
                <TextField
                  label="Domain"
                  value={form.organization.domain || ""}
                  onChange={(domain) =>
                    setForm((prev) => ({
                      ...prev,
                      organization: { ...prev.organization, domain },
                    }))
                  }
                  placeholder="e.g. smithdental.com"
                />
                <TextField
                  label="Address"
                  value={form.organization.address || ""}
                  onChange={(address) =>
                    setForm((prev) => ({
                      ...prev,
                      organization: { ...prev.organization, address },
                    }))
                  }
                  placeholder="e.g. 123 Main St, City, State"
                />
              </FieldGroup>

              <FieldGroup title="Admin User">
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <TextField
                    label="First Name"
                    value={form.user.firstName || ""}
                    onChange={(firstName) =>
                      setForm((prev) => ({
                        ...prev,
                        user: { ...prev.user, firstName },
                      }))
                    }
                  />
                  <TextField
                    label="Last Name"
                    value={form.user.lastName || ""}
                    onChange={(lastName) =>
                      setForm((prev) => ({
                        ...prev,
                        user: { ...prev.user, lastName },
                      }))
                    }
                  />
                </div>
                <TextField
                  label="Email"
                  required
                  type="email"
                  value={form.user.email}
                  onChange={(email) =>
                    setForm((prev) => ({ ...prev, user: { ...prev.user, email } }))
                  }
                  placeholder="user@example.com"
                />
                <TextField
                  label="Password"
                  required
                  type="password"
                  value={form.user.password}
                  onChange={(password) =>
                    setForm((prev) => ({
                      ...prev,
                      user: { ...prev.user, password },
                    }))
                  }
                  placeholder="Min 8 chars, 1 uppercase, 1 number"
                />
              </FieldGroup>

              <FieldGroup title="Primary Location">
                <TextField
                  label="Location Name"
                  value={form.location.name}
                  onChange={(name) =>
                    setForm((prev) => ({
                      ...prev,
                      location: { ...prev.location, name },
                    }))
                  }
                  placeholder="Defaults to organization name if empty"
                />
                <TextField
                  label="Location Address"
                  value={form.location.address || ""}
                  onChange={(address) =>
                    setForm((prev) => ({
                      ...prev,
                      location: { ...prev.location, address },
                    }))
                  }
                  placeholder="e.g. 123 Main St, City, State"
                />
              </FieldGroup>
            </div>

            <div className="mt-8 flex items-center justify-end gap-3">
              <button
                onClick={resetAndClose}
                className="px-4 py-2.5 text-sm font-bold text-gray-600 transition-colors hover:text-gray-800"
              >
                Cancel
              </button>
              <motion.button
                onClick={handleCreate}
                disabled={isCreating}
                className="flex items-center gap-2 rounded-xl bg-alloro-orange px-5 py-2.5 text-sm font-bold text-white transition-colors hover:bg-alloro-navy disabled:opacity-50"
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
              >
                <Plus className="h-4 w-4" />
                {isCreating ? "Creating..." : "Create Organization"}
              </motion.button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function getCreateErrorMessage(error: unknown): string {
  if (error && typeof error === "object") {
    const maybeResponse = error as {
      response?: { data?: { error?: string } };
      message?: string;
    };
    return (
      maybeResponse.response?.data?.error ||
      maybeResponse.message ||
      "Failed to create organization"
    );
  }
  return "Failed to create organization";
}

function FieldGroup({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <div>
      <h3 className="mb-3 text-sm font-bold uppercase tracking-wider text-alloro-navy">
        {title}
      </h3>
      <div className="space-y-3">{children}</div>
    </div>
  );
}

function TextField({
  label,
  value,
  onChange,
  placeholder,
  type = "text",
  required = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  type?: string;
  required?: boolean;
}) {
  return (
    <label className="block text-sm font-medium text-gray-700">
      <span className="mb-1 block">
        {label} {required && <span className="text-red-500">*</span>}
      </span>
      <input
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-alloro-orange focus:outline-none focus:ring-2 focus:ring-alloro-orange/20"
        placeholder={placeholder}
      />
    </label>
  );
}

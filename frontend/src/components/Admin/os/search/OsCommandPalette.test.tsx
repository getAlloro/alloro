/**
 * OS ⌘K command palette (plans/07042026-alloro-os-admin-port P4 T5). The
 * headline assertion is the LISTENER-LEAK guard the spec calls for: the global
 * keydown handler must be removed on unmount so the shortcut cannot fire on
 * other admin surfaces (the palette mounts only inside OsShell). We also cover
 * open-on-⌘K and close-on-Esc. The search API is mocked so no request fires.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { renderWithProviders } from "../../../../test/test-utils";

vi.mock("../../../../api/admin-os", () => ({
  // Palette only calls adminOsSearch; return an empty hybrid payload.
  adminOsSearch: vi.fn(async () => ({
    mode: "hybrid",
    lexical: { results: [], pagination: { page: 1, limit: 8, total: 0, totalPages: 0 } },
    semantic: { results: [] },
  })),
}));

import { OsCommandPalette } from "./OsCommandPalette";

beforeEach(() => {
  window.localStorage.clear();
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("OsCommandPalette", () => {
  it("removes its keydown listener on unmount (no shortcut leak)", () => {
    const addSpy = vi.spyOn(window, "addEventListener");
    const removeSpy = vi.spyOn(window, "removeEventListener");

    const { unmount } = renderWithProviders(<OsCommandPalette />);

    // The hook registered a keydown listener while mounted.
    const keydownAdds = addSpy.mock.calls.filter(([type]) => type === "keydown");
    expect(keydownAdds.length).toBeGreaterThan(0);
    const registeredHandler = keydownAdds[0][1];

    unmount();

    // The SAME handler reference is removed on unmount.
    expect(removeSpy).toHaveBeenCalledWith("keydown", registeredHandler);
  });

  it("opens on Cmd/Ctrl+K and closes on Escape", async () => {
    renderWithProviders(<OsCommandPalette />);

    // Closed initially — no dialog in the tree.
    expect(screen.queryByRole("dialog")).toBeNull();

    // ⌘K (metaKey) opens it.
    fireEvent.keyDown(window, { key: "k", metaKey: true });
    await waitFor(() =>
      expect(screen.getByRole("dialog")).toBeInTheDocument(),
    );
    expect(
      screen.getByLabelText("Search query"),
    ).toBeInTheDocument();

    // Esc closes it (AnimatePresence exit → element leaves the tree).
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  it("toggles closed on a second ⌘K press", async () => {
    renderWithProviders(<OsCommandPalette />);
    fireEvent.keyDown(window, { key: "k", metaKey: true });
    await waitFor(() =>
      expect(screen.getByRole("dialog")).toBeInTheDocument(),
    );
    fireEvent.keyDown(window, { key: "k", metaKey: true });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });
});

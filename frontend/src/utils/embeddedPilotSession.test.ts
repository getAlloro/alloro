import { beforeEach, describe, expect, it } from "vitest";
import {
  clearEmbeddedPilotSession,
  getEmbeddedPilotSession,
  getEmbeddedPilotStorageItem,
  isEmbeddedPilotSession,
  setEmbeddedPilotSession,
  updateEmbeddedPilotRole,
  updateEmbeddedPilotToken,
} from "./embeddedPilotSession";

describe("embeddedPilotSession", () => {
  beforeEach(() => {
    clearEmbeddedPilotSession();
    window.localStorage.clear();
    window.sessionStorage.clear();
  });

  it("keeps the pilot token in module memory", () => {
    setEmbeddedPilotSession({
      email: "client@example.com",
      role: "admin",
      token: "pilot-token",
      userId: 42,
    });

    expect(isEmbeddedPilotSession()).toBe(true);
    expect(getEmbeddedPilotSession()?.token).toBe("pilot-token");
    expect(getEmbeddedPilotStorageItem("token")).toBe("pilot-token");
    expect(getEmbeddedPilotStorageItem("user_role")).toBe("admin");
    expect(window.localStorage.length).toBe(0);
    expect(window.sessionStorage.length).toBe(0);
  });

  it("updates refreshed token and role without browser storage", () => {
    setEmbeddedPilotSession({ token: "old-token" });

    updateEmbeddedPilotToken("new-token");
    updateEmbeddedPilotRole("client");

    expect(getEmbeddedPilotStorageItem("token")).toBe("new-token");
    expect(getEmbeddedPilotStorageItem("user_role")).toBe("client");
    expect(window.localStorage.length).toBe(0);
    expect(window.sessionStorage.length).toBe(0);
  });
});

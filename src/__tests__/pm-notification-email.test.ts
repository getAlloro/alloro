import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../emails/emailService", () => ({
  sendEmail: vi.fn(),
}));

vi.mock("../models/UserModel", () => ({
  UserModel: {
    findEmailById: vi.fn(),
    findInternalProfilesByIds: vi.fn(),
  },
}));

vi.mock("../models/PmProjectModel", () => ({
  PmProjectModel: {
    findNameById: vi.fn(),
  },
}));

import { sendEmail } from "../emails/emailService";
import { PmProjectModel } from "../models/PmProjectModel";
import { UserModel } from "../models/UserModel";
import {
  sendPmMentionEmails,
  sendPmMovementEmails,
} from "../controllers/pm/feature-services/PmNotificationEmailService";

const mockedSendEmail = vi.mocked(sendEmail);
const mockedFindEmailById = vi.mocked(UserModel.findEmailById);
const mockedFindInternalProfiles = vi.mocked(
  UserModel.findInternalProfilesByIds,
);
const mockedFindProject = vi.mocked(PmProjectModel.findNameById);

const profile = (id: number, email: string) => ({
  id,
  email,
  name: null,
  first_name: null,
  last_name: null,
});

describe("PM notification email service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedSendEmail.mockResolvedValue({
      success: true,
      messageId: "synthetic-pm-message",
      timestamp: "2026-07-16T00:00:00.000Z",
    });
    mockedFindEmailById.mockResolvedValue({ email: "actor@getalloro.com" });
    mockedFindProject.mockResolvedValue({ name: "Website Launch" });
  });

  it("emails each unique mentioned internal user and excludes the actor", async () => {
    mockedFindInternalProfiles.mockResolvedValue([
      profile(2, "alex@getalloro.com"),
      profile(3, "sam@getalloro.com"),
    ]);

    await sendPmMentionEmails({
      actorUserId: 1,
      projectId: "project-1",
      taskId: "task-1",
      taskTitle: "Review <launch> checklist",
      commentBody: "Please review <script>alert(1)</script>",
      mentionedUserIds: [2, 2, 1, 3],
    });

    expect(mockedFindInternalProfiles).toHaveBeenCalledWith([2, 3]);
    expect(mockedSendEmail).toHaveBeenCalledTimes(2);
    expect(
      mockedSendEmail.mock.calls.map(([input]) => input.recipients[0]).sort(),
    ).toEqual(["alex@getalloro.com", "sam@getalloro.com"]);
    expect(mockedSendEmail.mock.calls[0][0].body).toContain(
      "&lt;script&gt;alert(1)&lt;/script&gt;",
    );
    expect(mockedSendEmail.mock.calls[0][0].body).not.toContain(
      "<script>alert(1)</script>",
    );
  });

  it("deduplicates creator and assignee movement recipients and skips self-email", async () => {
    mockedFindInternalProfiles.mockResolvedValue([
      profile(2, "creator@getalloro.com"),
      profile(3, "assignee@getalloro.com"),
    ]);

    await sendPmMovementEmails({
      actorUserId: 1,
      projectId: "project-1",
      taskId: "task-1",
      taskTitle: "Prepare launch",
      recipientUserIds: [2, 2, null, 1, 3, undefined],
      fromLabel: "To Do",
      toLabel: "In Progress",
      movementLabel: "Task moved",
    });

    expect(mockedFindInternalProfiles).toHaveBeenCalledWith([2, 3]);
    expect(mockedSendEmail).toHaveBeenCalledTimes(2);
    expect(mockedSendEmail.mock.calls[0][0].subject).toContain("Task moved");
    expect(mockedSendEmail.mock.calls[0][0].body).toContain("To Do");
    expect(mockedSendEmail.mock.calls[0][0].body).toContain("In Progress");
  });
});

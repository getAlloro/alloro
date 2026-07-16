import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { UserRoleSelect } from "./UserRoleSelect";

const USER_ROLES = ["viewer", "manager", "admin"] as const;

describe("UserRoleSelect", () => {
  it("selects a role with listbox semantics and restores trigger focus", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <UserRoleSelect
        value="viewer"
        options={[...USER_ROLES]}
        onChange={onChange}
        ariaLabel="Member role"
        placement="table"
      />,
    );

    const trigger = screen.getByRole("button", { name: "Member role" });
    await user.click(trigger);
    expect(trigger).toHaveAttribute("aria-expanded", "true");
    const listbox = screen.getByRole("listbox", { hidden: true });
    expect(listbox).toHaveAttribute("aria-label", "Member role");

    await user.click(within(listbox).getByText("Manager"));
    expect(onChange).toHaveBeenCalledWith("manager");
    await waitFor(() => expect(trigger).toHaveFocus());
    expect(trigger).toHaveAttribute("aria-expanded", "false");
  });

  it("supports arrow selection and Escape without changing the value", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <UserRoleSelect
        value="viewer"
        options={[...USER_ROLES]}
        onChange={onChange}
        ariaLabel="Invitation role"
        placement="invite"
      />,
    );

    const trigger = screen.getByRole("button", { name: "Invitation role" });
    trigger.focus();
    await user.keyboard("{ArrowDown}");
    await user.keyboard("{ArrowDown}{Enter}");
    expect(onChange).toHaveBeenCalledWith("manager");

    await user.click(trigger);
    await user.keyboard("{Escape}");
    expect(onChange).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(trigger).toHaveFocus());
  });
});

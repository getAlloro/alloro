import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { renderWithProviders, screen, waitFor } from "../../test/test-utils";
import { AnimatedSelect } from "./AnimatedSelect";

const stringOptions = [
  { value: "all", label: "All projects" },
  { value: "alloro", label: "Alloro" },
  { value: "dentalemr", label: "DentalEMR" },
];

describe("AnimatedSelect", () => {
  it("opens an accessible listbox and selects with a pointer", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    renderWithProviders(
      <AnimatedSelect
        ariaLabel="Project filter"
        value="all"
        options={stringOptions}
        onChange={onChange}
      />,
    );

    const trigger = screen.getByRole("button", { name: "Project filter" });
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    await user.click(trigger);

    expect(trigger).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("listbox", { name: "Project filter" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "All projects" })).toHaveAttribute("aria-selected", "true");

    await user.click(screen.getByRole("option", { name: "Alloro" }));
    expect(onChange).toHaveBeenCalledWith("alloro");
    expect(trigger).toHaveAttribute("aria-expanded", "false");
  });

  it("supports boundary keys and selects typed numeric values", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    renderWithProviders(
      <AnimatedSelect<number | null>
        ariaLabel="Assignee"
        value={null}
        options={[
          { value: null, label: "Unassigned" },
          { value: 11, label: "Dave" },
          { value: 42, label: "Jordan" },
        ]}
        onChange={onChange}
      />,
    );

    const trigger = screen.getByRole("button", { name: "Assignee" });
    await user.click(trigger);
    await user.keyboard("{End}{Enter}");
    expect(onChange).toHaveBeenCalledWith(42);

    await waitFor(() => expect(trigger).toHaveAttribute("aria-expanded", "false"));
    await user.click(trigger);
    await user.keyboard("{End}{ArrowUp}{Enter}");
    expect(onChange).toHaveBeenCalledWith(11);

    await waitFor(() => expect(trigger).toHaveAttribute("aria-expanded", "false"));
    await user.click(trigger);
    await user.keyboard("{End}{Home}{Enter}");
    expect(onChange).toHaveBeenCalledWith(null);
  });

  it("skips disabled options during arrow navigation", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    renderWithProviders(
      <AnimatedSelect
        ariaLabel="Priority"
        value="all"
        options={[
          { value: "all", label: "All priorities" },
          { value: "P1", label: "P1", isDisabled: true },
          { value: "P2", label: "P2" },
        ]}
        onChange={onChange}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Priority" }));
    await user.keyboard("{ArrowDown}{Enter}");
    expect(onChange).toHaveBeenCalledWith("P2");
    await waitFor(() => expect(screen.getByRole("button", { name: "Priority" })).toHaveFocus());
  });

  it("closes with Escape and outside pointer interaction", async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <div>
        <AnimatedSelect
          ariaLabel="Project filter"
          value="all"
          options={stringOptions}
          onChange={vi.fn()}
        />
        <button type="button">Outside</button>
      </div>,
    );

    const trigger = screen.getByRole("button", { name: "Project filter" });
    await user.click(trigger);
    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("listbox")).not.toBeInTheDocument());
    await waitFor(() => expect(trigger).toHaveFocus());

    await user.click(trigger);
    await user.click(screen.getByRole("button", { name: "Outside" }));
    await waitFor(() => expect(screen.queryByRole("listbox")).not.toBeInTheDocument());
  });

  it("keeps a disabled trigger closed", async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <AnimatedSelect
        ariaLabel="Disabled project filter"
        value="all"
        options={stringOptions}
        onChange={vi.fn()}
        isDisabled
      />,
    );

    const trigger = screen.getByRole("button", { name: "Disabled project filter" });
    expect(trigger).toBeDisabled();
    await user.click(trigger);
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });
});

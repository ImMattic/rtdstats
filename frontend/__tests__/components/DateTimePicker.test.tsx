import type { ComponentProps } from "react";
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import DateTimePicker from "@/components/ui/DateTimePicker";

// The component labels days and months with Intl, so build the expected strings
// the same way rather than hardcoding one locale's output.
const DAY_LABEL = new Intl.DateTimeFormat(undefined, {
  weekday: "short",
  month: "short",
  day: "numeric",
});
const MONTH_LABEL = new Intl.DateTimeFormat(undefined, { month: "long", year: "numeric" });

const dayLabel = (y: number, m: number, d: number) => DAY_LABEL.format(new Date(y, m, d));

/** A window covering 9–10 Sep 2026 only. */
const BOUNDS = { min: "2026-09-09T00:00", max: "2026-09-10T23:59" };

function setup(props: Partial<ComponentProps<typeof DateTimePicker>> = {}) {
  const onChange = vi.fn();
  render(
    <DateTimePicker
      label="Start"
      value="2026-09-09T10:00"
      onChange={onChange}
      bounds={BOUNDS}
      {...props}
    />,
  );
  return { onChange };
}

const openPopover = async () => {
  const user = userEvent.setup();
  await user.click(screen.getByRole("button", { name: /start/i }));
  return { user, dialog: screen.getByRole("dialog") };
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("DateTimePicker (custom calendar)", () => {
  it("shows the current value on the trigger and opens on click", async () => {
    setup();
    const trigger = screen.getByRole("button", { name: /start/i });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    await userEvent.click(trigger);
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByText(MONTH_LABEL.format(new Date(2026, 8, 1)))).toBeInTheDocument();
  });

  it("disables days outside the selectable window", async () => {
    setup();
    const { dialog } = await openPopover();

    expect(within(dialog).getByLabelText(dayLabel(2026, 8, 8))).toBeDisabled();
    expect(within(dialog).getByLabelText(dayLabel(2026, 8, 11))).toBeDisabled();
  });

  it("keeps days that only partly overlap the window selectable", async () => {
    setup({ bounds: { min: "2026-09-09T14:30", max: "2026-09-10T09:00" } });
    const { dialog } = await openPopover();

    // 9 Sep is reachable from 14:30, 10 Sep until 09:00 — neither is a dead day.
    expect(within(dialog).getByLabelText(dayLabel(2026, 8, 9))).toBeEnabled();
    expect(within(dialog).getByLabelText(dayLabel(2026, 8, 10))).toBeEnabled();
  });

  it("reports the picked day with the time of day carried over", async () => {
    const { onChange } = setup();
    const { user, dialog } = await openPopover();

    await user.click(within(dialog).getByLabelText(dayLabel(2026, 8, 10)));
    expect(onChange).toHaveBeenCalledWith("2026-09-10T10:00");
  });

  it("clamps a pick that lands outside the window back to the nearest edge", async () => {
    // 10:00 on 10 Sep is past the 09:00 cap, so it settles on the cap itself.
    const { onChange } = setup({ bounds: { min: "2026-09-09T00:00", max: "2026-09-10T09:00" } });
    const { user, dialog } = await openPopover();

    await user.click(within(dialog).getByLabelText(dayLabel(2026, 8, 10)));
    expect(onChange).toHaveBeenCalledWith("2026-09-10T09:00");
  });

  it("disables the hours that fall outside the window on a boundary day", async () => {
    setup({ value: "2026-09-09T20:00", bounds: { min: "2026-09-09T18:00", max: "2026-09-10T09:00" } });
    const { dialog } = await openPopover();

    const hours = within(dialog).getByLabelText(/start hour/i);
    expect(within(hours).getByRole("option", { name: "9 AM" })).toBeDisabled();
    expect(within(hours).getByRole("option", { name: "7 PM" })).toBeEnabled();
  });

  it("stops month paging at the edges of the window", async () => {
    setup();
    const { dialog } = await openPopover();

    expect(within(dialog).getByRole("button", { name: /previous month/i })).toBeDisabled();
    expect(within(dialog).getByRole("button", { name: /next month/i })).toBeDisabled();
  });

  it("jumps to the newest allowed instant via Latest", async () => {
    const { onChange } = setup();
    const { user, dialog } = await openPopover();

    await user.click(within(dialog).getByRole("button", { name: /latest/i }));
    expect(onChange).toHaveBeenCalledWith(BOUNDS.max);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("closes on Escape", async () => {
    setup();
    const { user } = await openPopover();
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});

describe("DateTimePicker (phone)", () => {
  function stubPhoneViewport() {
    vi.stubGlobal("matchMedia", (query: string) => ({
      matches: query.includes("max-width: 639px"),
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    }));
  }

  it("hands off to the platform control with min/max set", async () => {
    stubPhoneViewport();
    setup({ id: "start-field" });

    const input = await screen.findByLabelText("Start");
    expect(input).toHaveAttribute("type", "datetime-local");
    expect(input).toHaveAttribute("min", BOUNDS.min);
    expect(input).toHaveAttribute("max", BOUNDS.max);
  });

  it("carries the current value and does not render our calendar", async () => {
    stubPhoneViewport();
    setup({ id: "start-field" });

    expect(await screen.findByLabelText("Start")).toHaveValue("2026-09-09T10:00");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});

// World Clock: plain math, no permissions. Shows: a multiselect setting, ui.list, and keeping the clock math in a
// pure module (src/clock.ts) that tests can call with a fixed time.

import { CITIES, dayLabel, formatTime, wallClock } from "./clock";

const { activity, ui } = AdanotchKit;

interface Settings {
  cities: string[];
  hour12: boolean;
}

activity<Settings>({
  update(ctx) {
    const now = Date.now();
    // Your day: the time zone of the Mac running Adanotch.
    const mine = wallClock(now, -new Date(now).getTimezoneOffset());
    const chosen = ctx.settings.cities.filter((id) => id in CITIES);

    if (chosen.length === 0) {
      return { compact: { leading: ui.icon("clock") }, expanded: ui.text("Pick a city in the settings.", { tone: "secondary" }) };
    }

    const first = CITIES[chosen[0]];
    return {
      compact: {
        leading: ui.icon("globe"),
        trailing: ui.text(formatTime(wallClock(now, first.offset), ctx.settings.hour12)),
      },
      expanded: ui.list(
        chosen.map((id) => {
          const city = CITIES[id];
          const clock = wallClock(now, city.offset);
          return {
            title: city.name,
            subtitle: dayLabel(clock, mine),
            icon: "clock",
            trailing: formatTime(clock, ctx.settings.hour12),
          };
        }),
      ),
    };
  },
});

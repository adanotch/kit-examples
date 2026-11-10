// Battery Health: reads the battery with `battery.read` and warns once when it drops below a threshold.
// Shows: a system API (battery.read), an event (battery.change), a notification (notify.island), ctx.storage.

const { activity, ui, battery, notify, events } = AdanotchKit;

/** Must match "settings" in manifest.json. */
interface Settings {
  warnPercent: number;
  showDevices: boolean;
}

/** Battery symbol: a bolt while charging, otherwise filled by level. */
function symbolFor(percentage: number, charging: boolean): string {
  if (charging) return "battery.100percent.bolt";
  if (percentage > 75) return "battery.100percent";
  if (percentage > 50) return "battery.75percent";
  if (percentage > 25) return "battery.50percent";
  if (percentage > 10) return "battery.25percent";
  return "battery.0percent";
}

/** "1 h 20 min", "45 min"; empty while macOS is still estimating. */
function formatMinutes(minutes: number | null): string {
  if (minutes === null) return "";
  const hours = Math.floor(minutes / 60);
  return hours > 0 ? `${hours} h ${minutes % 60} min` : `${minutes} min`;
}

activity<Settings>({
  setup(ctx) {
    // Refresh as soon as the battery state changes instead of waiting for the next 30 s tick.
    events.on("battery.change", () => ctx.refresh());
  },

  async update(ctx) {
    const state = await battery.read();
    if (!state.hasInternalBattery) {
      return {
        compact: { leading: ui.icon("powerplug"), trailing: ui.text("AC") },
        expanded: ui.text("This Mac has no battery.", { tone: "secondary" }),
      };
    }

    const { percentage, isCharging } = state;
    const low = !isCharging && percentage <= ctx.settings.warnPercent;

    // Warn once each time the level crosses the threshold, not repeatedly while it stays low.
    // The flag resets when the battery is no longer low (for example, once plugged in).
    const warned = ctx.storage.get<boolean>("warned") ?? false;
    if (low && !warned) {
      ctx.storage.set("warned", true);
      notify.island({ text: `Battery ${percentage}%`, icon: "battery.25percent", tone: "warning", duration: 5 });
    } else if (!low && warned) {
      ctx.storage.set("warned", false);
    }

    const remaining = formatMinutes(state.minutesRemaining);
    const status = isCharging
      ? `Charging${remaining ? ` · full in ${remaining}` : ""}`
      : state.isPluggedIn
        ? "Plugged in"
        : `On battery${remaining ? ` · ${remaining} left` : ""}`;

    return {
      compact: {
        leading: ui.icon(symbolFor(percentage, isCharging), { tone: low ? "warning" : isCharging ? "success" : "default" }),
        trailing: ui.text(`${percentage}%`, { tone: low ? "warning" : "default" }),
      },
      expanded: ui.stack(
        [
          ui.stack(
            [
              ui.ring(percentage, { label: `${percentage}%`, tone: low ? "warning" : isCharging ? "success" : "accent" }),
              ui.stack([ui.text("Battery", { style: "title" }), ui.text(status, { style: "caption", tone: "secondary" })], {
                spacing: 4,
              }),
            ],
            { axis: "h", spacing: 12, align: "center" },
          ),
          low && ui.badge(`Below the ${ctx.settings.warnPercent}% threshold`, { tone: "warning" }),
          ctx.settings.showDevices &&
            state.devices.length > 0 &&
            ui.list(
              state.devices.map((device) => ({
                title: device.name,
                icon: "dot.radiowaves.left.and.right",
                trailing: `${device.percentage}%`,
                tone: device.percentage <= ctx.settings.warnPercent ? "warning" : "default",
              })),
            ),
        ],
        { spacing: 10 },
      ),
    };
  },
});

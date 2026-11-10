// The extension's entry point. `npm run build` bundles it into dist/index.js, which manifest.json runs.

const { activity, ui, system, events } = AdanotchKit;

/** Must match `settings` in manifest.json. */
interface Settings {
  showMemory: boolean;
}

/** The last 30 samples (refresh is 2 s: the last minute). Kept in memory, so it starts over when Adanotch restarts. */
const history: number[] = [];

activity<Settings>({
  setup(ctx) {
    // `adanotch ext <id> reset`, or adanotch://ext/<id>/reset from Shortcuts
    events.on("command", ({ name }) => {
      if (name === "reset") {
        ctx.storage.remove("clicks");
        ctx.refresh();
      }
    });
  },

  async update(ctx) {
    const stats = await system.stats();
    history.push(stats.cpuPercent);
    if (history.length > 30) history.shift();
    const clicks = ctx.storage.get<number>("clicks") ?? 0;
    const busy = stats.cpuPercent > 80;

    return {
      compact: {
        leading: ui.icon("cpu"),
        trailing: ui.text(`${stats.cpuPercent}%`, { tone: busy ? "warning" : "default" }),
      },
      expanded: ui.stack([
        ui.stack(
          [
            ui.ring(stats.cpuPercent, { label: "CPU", tone: busy ? "warning" : "accent" }),
            ctx.settings.showMemory && ui.ring(stats.ramPercent, { label: "RAM", tone: "success" }),
            ui.chart(history, { style: "area", min: 0, max: 100, tone: busy ? "warning" : "accent" }),
          ],
          { axis: "h", spacing: 12, align: "center" },
        ),
        ui.stack(
          [
            ui.text(`${clicks} clicks`, { style: "caption", tone: "secondary" }),
            ui.spacer(),
            ui.button("Click", "click", { icon: "hand.tap" }),
          ],
          { axis: "h" },
        ),
      ]),
    };
  },

  onAction(action, ctx) {
    if (action === "click") {
      const clicks = (ctx.storage.get<number>("clicks") ?? 0) + 1;
      ctx.storage.set("clicks", clicks);
      console.log("clicked", clicks);
    }
  },
});

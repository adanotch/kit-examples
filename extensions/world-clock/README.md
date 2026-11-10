# World Clock

The time in the cities you pick: the first beside the notch, all of them in the open card, each with "Today / Tomorrow / Yesterday" relative to your own day.

**Shows:** `multiselect` and `toggle` settings, `ui.list`, and keeping the clock math in a pure module (`src/clock.ts`) that tests call with a fixed time. Only cities without daylight saving time are listed; the reason is at the top of `src/clock.ts`.

**Permissions:** none.

---

An Adanotch extension. It is written in TypeScript, compiled into a single JavaScript file, and runs in its own isolated, sandboxed process, separate from Adanotch.

Detailed guide and API reference: **[https://www.adanotch.com/docs/en](https://www.adanotch.com/docs/en)**

## Quick Start

1. Enable **Developer Mode** in Adanotch › Settings › Developer.
2. If the `adanotch` command is not installed, install it using **Terminal Command › Install** on the same page.
3. In this directory, run:

   ```sh
   npm install
   npm run watch     # Recompiles dist/index.js whenever src/ changes
   ```

4. In a second terminal, run:

   ```sh
   adanotch dev      # Sends changes to Adanotch and displays console.log output here
   ```

Edit and save `src/index.ts`; the island will reload within a few hundred milliseconds. Errors are reported with source locations, such as `src/index.ts:12:5`.

## Commands

| Command                              | Description                                                                               |
| ------------------------------------ | ----------------------------------------------------------------------------------------- |
| `npm run build`                      | Generates `dist/index.js`                                                                 |
| `npm run watch`                      | Recompiles automatically whenever you save changes                                        |
| `npm test`                           | Runs tests under `test/` in Node using Adanotch's own runtime                             |
| `npm run typecheck`                  | Type-checks the source code and tests                                                     |
| `npm run lint`                       | Runs `adanotch lint`: validates the manifest, permissions, and missing `network:` domains |
| `npm run package`                    | Runs `adanotch build` to create a shareable `.adanotchext` file                           |
| `adanotch ext <id> <command> [data]` | Sends a `command` event to the extension (also available through Shortcuts)               |

When you're done, go to Settings › Extensions › **Install Extension…** and select this directory or the `.adanotchext` file. Adanotch copies the extension into its own library, so it remains installed across restarts.

## Directory Structure

| File                 | Description                                                                                                                                    |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `manifest.json`      | Identity, permissions, refresh interval, and settings                                                                                          |
| `src/index.ts`       | Extension source code                                                                                                                          |
| `test/index.test.ts` | Tests                                                                                                                                          |
| `dist/index.js`      | Compiled output; this is what Adanotch executes                                                                                                |
| `icon.png`           | Optional icon                                                                                                                                  |

## API Overview

Everything is available through the global `AdanotchKit` object; nothing needs to be imported. The complete API is documented in the types in `@adanotch/kit` and available through your editor's autocomplete.

```ts
const { activity, ui, events } = AdanotchKit;

activity<Settings>({
  async setup(ctx) {
    // Runs once: subscribe to events and set up timers
    events.on("media.change", (track) => ctx.refresh());
  },
  async update(ctx) {
    // Runs on every refresh, after actions, and after settings changes; returns the view
    const res = await fetch("https://api.example.com/now");
    const { temp } = await res.json();
    return {
      compact: { trailing: ui.text(`${temp}°`) },
      expanded: ui.text(`Currently ${temp}°`),
    };
  },
  onAction(action, ctx, value) {
    // Called when a ui.button / toggle / slider / list item is used; update() runs afterward
  },
});
```

- **UI:** `text`, `markdown`, `icon`, `image`, `pet`, `swatch`, `badge`, `calendarDay`, `countdown`, `gauge`, `ring`, `progress`, `chart`, `timer`, `stack`, `grid`, `scroll`, `tabs`, `divider`, `spacer`, `button`, `toggle`, `slider`, `textField`, `textArea`, `datePicker`, `picker`, `table`, `list`.
- **Partial updates:** `ctx.render({ compact })` updates only the provided sections without waiting for `update()`.
- **Storage:** `ctx.storage.get/set/remove/keys/clear` — JSON values, up to 512 KB.
- **Web APIs:** `fetch`, `URL`, `URLSearchParams`, `setTimeout`/`setInterval`, `TextEncoder`, `atob`/`btoa`, `crypto.randomUUID()`.
- **Secrets:** Define a setting with `"type": "secret"` in the manifest. Read it in your code using `await AdanotchKit.secrets.get("token")`. Secrets are stored in the Keychain.

## Permissions

| Permission                           | Available API                                                                                  |
| ------------------------------------ | ---------------------------------------------------------------------------------------------- |
| `system.stats`                       | `system.stats()`: CPU %, RAM %                                                                 |
| `battery.read`                       | `battery.read()`, `battery.change` event                                                       |
| `notifications`                      | `notify.island({ text, icon, tone })`                                                          |
| `media.read` / `media.control`       | `media.nowPlaying()`, `media.change` / `media.play()`, `next()`, `seek()`, etc.                |
| `timer.read` / `timer.control`       | `timer.read()`, `timer.change` event / `timer.start()`, `pause()`, `reset()`, `skip()`, `select(mode)` |
| `devices.read`                       | `device.change` event: Bluetooth, disks, VPN, displays, network lost/restored                  |
| `calendar.read`                      | `calendar.events({ days })`, `calendar.change`                                                 |
| `reminders.read`                     | `reminders.today()`, `reminders.change`                                                        |
| `clipboard.read` / `clipboard.write` | `clipboard.readText()`, `clipboard.change` / `clipboard.writeText()`                           |
| `network:domain.com`                 | Allows `fetch` requests to that domain and its subdomains (including redirects and `ui.image`) |

Users approve permissions when installing an extension. Calling an API without the required permission throws a `PermissionError`.

## Limitations

- A single synchronous execution block cannot exceed **200 ms**. Break up longer tasks using `await`. If this limit is exceeded, the process is terminated and restarted. If this happens three times consecutively, the extension is stopped.
- Memory limit: **64 MB**. CPU usage must average no more than **50% over 10 seconds**.
- `fetch`: HTTPS only, up to 6 concurrent requests and 120 requests per minute, with a maximum response size of 5 MB.
- No DOM, `require`, filesystem access, or Node.js APIs. Bundled npm packages must not depend on these features.

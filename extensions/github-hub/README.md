# GitHub Hub

An advanced example extension: GitHub in the island.

- **Reviews / My PRs / Issues / Inbox** tabs from the REST search and notifications APIs; each row has
  buttons (open in the browser, approve, mark read), and clicking a row opens a comment composer (`textArea`, ⌘↩ sends).
- **CI state** of your PRs from the check runs of their head commit (✓ / ✗ / running).
- **New review request**: a toast, a sound (`sound.play`) and your companion (`ui.pet("active", "surprised")`) startles.
  The first run only remembers what's there. Quiet while snoozed (`datePicker` → `countdown`) or during a Focus
  interval (`timer.change`).
- **Approve takes two taps**, because it can't be taken back.
- **Copy a GitHub PR/issue link** and a toast summarises it (`clipboard.change`, `island.show`).
- **Contribution chart** of the last 28 days (GraphQL), as a `chart` and a `table`.
- Polite to the API: ETags on the inbox (a 304 is free), cache-first redraws after actions, CI checks two PRs at a time,
  a section that fails keeps its cached data and shows why; offline shows the last good data.
- Losing a permission doesn't stop it: no `timer.read`, `clipboard.read` or `notifications` just turns that feature off.

Set the token in Settings › Extensions › GitHub Hub (`repo`, `notifications`, `read:user`); it lives in the Keychain.

```sh
npm install
npm run typecheck && npm test && npm run build && npm run lint
npm run package     # a shareable .adanotchext
```

`adanotch lint` warns that `github.com` appears in the bundle: those are links passed to `open()`, not fetched.

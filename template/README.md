# {{name}}

An [Adanotch](https://www.adanotch.com) extension: TypeScript, bundled into one JavaScript file, run in its own sandboxed
process beside the notch. Guide and API reference: <https://www.adanotch.com/docs/en>.

## Quick start

1. In Adanotch, turn on **Settings › Developer › Developer mode**. If the `adanotch` command is missing, install it from
   **Terminal Command** on the same page.
2. In this folder:

   ```sh
   npm install
   npm run watch      # rebuilds dist/index.js on every save
   adanotch dev       # loads this folder into Adanotch and reloads on every build
   ```

## Folder

| Path                 | What                                                                  |
| -------------------- | --------------------------------------------------------------------- |
| `manifest.json`      | Identity, permissions, refresh interval and settings                  |
| `src/index.ts`       | The extension                                                         |
| `test/index.test.ts` | Tests, run under Node on Adanotch's own runtime                       |
| `dist/index.js`      | The build; this is what Adanotch runs                                 |
| `icon.png`           | Optional icon                                                         |

The API is the global `AdanotchKit`; nothing is imported. Its types come from
[`@adanotch/kit`](https://github.com/adanotch/kit), so your editor completes and checks it, and flags what is deprecated.

## Scripts

| Script              | What                                                           |
| ------------------- | -------------------------------------------------------------- |
| `npm run typecheck` | `tsc` on the source and the tests                              |
| `npm test`          | Runs the tests                                                 |
| `npm run build`     | Bundles `src/index.ts` into `dist/index.js`                    |
| `npm run lint`      | `adanotch lint`: manifest, permissions, undeclared hosts       |
| `npm run package`   | Builds a shareable `.adanotchext`                              |

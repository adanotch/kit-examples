# Adanotch kit examples

Small, working [Adanotch](https://www.adanotch.com) extensions to read, copy and learn from, built on
[`@adanotch/kit`](https://github.com/adanotch/kit). Each folder under `extensions/` is a complete project: `manifest.json`,
`src/`, tests and its own `package.json`, so you can copy one anywhere and it works.

| Example                                      | What it shows                                                                       | Permissions                                                                |
| -------------------------------------------- | ----------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| [`battery-health`](extensions/battery-health) | System data and events, a one-time warning notification, storage                    | `battery.read`, `notifications`                                            |
| [`world-clock`](extensions/world-clock)       | Multiselect and toggle settings, `ui.list`, a pure module you can test with fixed times | none                                                                   |
| [`quick-list`](extensions/quick-list)         | A text field, list rows with buttons, persistent storage, commands from outside     | none                                                                       |
| [`github-hub`](extensions/github-hub)         | A larger extension: network with a secret token, tabs, notifications, mocked requests | `network:api.github.com`, `notifications`, `clipboard.read`, `timer.read` |

Also here:

- [`pets/`](pets): a companion (an animated pet) and how to draw one.
- [`template/`](template): the project `adanotch init` creates. `{{id}}`, `{{name}}` and `{{slug}}` are filled in.

## Try one

```sh
cd extensions/battery-health
npm install
npm test           # runs the extension on Adanotch's own runtime, with mocked answers
npm run build      # dist/index.js
```

Then in Adanotch: **Settings › Extensions › Load Folder** and pick the folder. To reload on every save, turn on
**Settings › Developer › Developer mode** and run `npm run watch` and `adanotch dev`.

To start your own: `adanotch init my-extension`. Guide and API reference: <https://www.adanotch.com/docs/en>.

## License

[MIT](LICENSE). Copy, change and ship these as you like.

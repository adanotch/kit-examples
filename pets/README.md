# Companions

A companion is a folder: `pet.json` (`{"id": "blob-cat", "name": "Biscuit"}`) plus one SVG per pose (`idle`, `dance`,
`sad`, `sleep`, `happy`, `surprised`, `exhausted`, `loved`, and the ten newer ones: `recording`, `posing`, `celebrating`,
`dizzy`, `melting`, `yawning`, `nightShift`, `alert`, `zen`, `searching`). `idle.svg` is required; a missing pose shows
`idle`. When each pose is shown: <https://www.adanotch.com/docs/en/guides/companions#poses>. Add one in Adanotch under
**Settings › Lokum › Pets › Add pet…**.

Drawing rules (nothing in a pet runs code):

- Elements: `g`, `path`, `circle`, `ellipse`, `rect`, `text`. Anything else is ignored.
- The character sits in a 0…40 × 0…32 box; the view box is `-10 -14 60 52`, so antennae and sparkles may reach outside.
- Colours: `#rrggbb`, or Lokum's names (`ink`, `cheek`, `mouth`, `white`, `pink`, `yellow`, `red`, `orange`, `green`,
  `blue`, `cyan`).
- Animation classes on a `g`: `p-breathe`, `p-bob`, `p-droop`, `p-jump`, `p-blink`, `p-tw`, `p-z`, `p-h`, `p-n`, `p-t`,
  `p-led`, `p-spin`, `p-fall`.
- Each file is at most 64 KB and 600 elements.

Extensions show a companion with `ui.pet("<id>", "<pose>", { size })`: an installed pet's id, `"lokum"` for Lokum herself
or `"active"` for whichever the user chose (so `lokum` and `active` can't be pet ids). It works in a compact slot too.

See [`blob-cat/`](blob-cat).

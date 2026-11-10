// Quick List: a text field, list rows with buttons, persistent storage and commands from outside.
// Shows: ui.textField, ui.list (action + buttons), ctx.storage, events.on("command").
//
// Add from outside:  adanotch ext local.adanotch.quick-list add "Buy milk"
// From Shortcuts:    adanotch://ext/local.adanotch.quick-list/add?data=%22Buy%20milk%22

const { activity, ui, events } = AdanotchKit;

interface Settings {
  hideDone: boolean;
}

interface Item {
  id: string;
  text: string;
  done: boolean;
}

const MAX_ITEMS = 50;
const MAX_LENGTH = 80;

type Store = { get<T>(key: string): T | undefined | null; set(key: string, value: unknown): void };

const load = (storage: Store): Item[] => storage.get<Item[]>("items") ?? [];
const save = (storage: Store, items: Item[]) => storage.set("items", items);

/** Drops empty text and trims long text. */
function clean(text: unknown): string {
  return String(text ?? "").trim().slice(0, MAX_LENGTH);
}

function add(storage: Store, text: unknown): void {
  const value = clean(text);
  const items = load(storage);
  if (!value || items.length >= MAX_ITEMS) return;
  // Id: the time plus the position, so two adds in the same millisecond don't collide.
  save(storage, [...items, { id: `${Date.now()}-${items.length}`, text: value, done: false }]);
}

activity<Settings>({
  setup(ctx) {
    events.on("command", ({ name, data }) => {
      if (name === "add") add(ctx.storage, data);
      if (name === "clear") save(ctx.storage, load(ctx.storage).filter((item) => !item.done));
      ctx.refresh();
    });
  },

  update(ctx) {
    const items = load(ctx.storage);
    const open = items.filter((item) => !item.done).length;
    const shown = ctx.settings.hideDone ? items.filter((item) => !item.done) : items;

    return {
      compact: {
        leading: ui.icon("checklist"),
        trailing: open > 0 ? ui.badge(String(open)) : undefined,
      },
      expanded: ui.stack(
        [
          ui.textField("add", { placeholder: "New item, press Return to add", value: "" }),
          shown.length === 0
            ? ui.text(items.length === 0 ? "The list is empty." : "All done.", { tone: "secondary" })
            : ui.list(
                shown.map((item) => ({
                  title: item.text,
                  icon: item.done ? "checkmark.circle.fill" : "circle",
                  tone: item.done ? "secondary" : "default",
                  action: "toggle",
                  value: item.id,
                  buttons: [{ icon: "trash", label: "Delete", action: "remove", value: item.id }],
                })),
              ),
          items.some((item) => item.done) && ui.button("Clear completed", "clear", { icon: "sparkles" }),
        ],
        { spacing: 10 },
      ),
    };
  },

  onAction(action, ctx, value) {
    const items = load(ctx.storage);
    if (action === "add") add(ctx.storage, value);
    if (action === "toggle") save(ctx.storage, items.map((item) => (item.id === value ? { ...item, done: !item.done } : item)));
    if (action === "remove") save(ctx.storage, items.filter((item) => item.id !== value));
    if (action === "clear") save(ctx.storage, items.filter((item) => !item.done));
  },
});

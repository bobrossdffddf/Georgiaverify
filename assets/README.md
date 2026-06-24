# Embed banner images

Drop the two banner images used in the Discord embeds here, with **these exact filenames**:

| Filename             | Used as                          |
|----------------------|----------------------------------|
| `Copy_of_hcso_8.webp` | Top banner (panel + verified)    |
| `geo_1.png`           | Bottom banner (panel + verified) |

These are the same two images shown in your Discohook embed (`attachment://Copy_of_hcso_8.webp` and `attachment://geo_1.png`).

If a file is missing, the bot simply omits that banner from the message instead of erroring — so you can run without them, but the embeds will look nicer with them present.

> The filenames are configurable via `config.assets` in `src/config.js` if you want to rename them.

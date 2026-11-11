# pixel-pad

A pixel art pad for Claude Code. Open it in a pane beside the chat, draw with the mouse, and Claude sees your drawing with your next message.

## Install

At the prompt of a terminal session:

```
/plugin install pixel-pad --marketplace jgrugru/pixel-pad
```

From a shell:

```
claude plugin install pixel-pad --marketplace jgrugru/pixel-pad
```

## Use

1. Run `/pixel-pad` to open the pane.
2. Click a color in the top row, then hold the left mouse button and drag to draw. Click `[ Clear ]` to start over.
3. Type a message as usual. While the pane is open, Claude is told where your current drawing is and views it as a PNG.

## How it works

- The canvas is 48x48 pixels. Each terminal cell holds two pixels (a half block), so it takes 48 columns by 24 rows.
- After each stroke the drawing is saved to `.pixel-pad/art.png` in your working directory (384x384). Add `.pixel-pad/` to your `.gitignore`.
- A plugin cannot attach image bytes to a prompt, so the drawing is not a true attachment: your prompt carries a hidden note with the PNG's path, and Claude opens it with its Read tool.
- Drawing needs a terminal that reports mouse events. Terminals that report sub-cell mouse positions (kitty, Ghostty, iTerm2, WezTerm) give half-row precision; elsewhere a click paints both pixels of a cell.

## Limits

- Terminal surface only.
- One canvas size, nine colors.

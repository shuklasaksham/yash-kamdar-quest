# Yash Kamdar — A 3D Artist's Quest

The portfolio of **Yash Kamdar**, 3D Environment Artist, played as a 16-bit side-scrolling quest.

Walk across a pixel-art island and one-shot three guardians. Each one guards part of the portfolio:

| Guardian | Unlocks |
| --- | --- |
| Slime King | **About**: story, skills, tools |
| Stone Golem | **Work**: experience and training |
| Shadow Knight | **Portfolio**: renders, Swamp Barn shots, sketches |

The journey ends on a sunset hill where Yash meets his love, followed by the contact links.

You don't have to play to read. Any section can be opened at any time from the quest log, the pause menu or the title's **Quick View**. Inside the panel, switch sections with ← →, swipe, or Prev / Next. Choosing **Portfolio** (or any section) from the title or the pause menu teleports the hero straight to that guardian.

## Controls

| Action | Keyboard | Touch |
| --- | --- | --- |
| Walk | ← → or A D | ◀ ▶ |
| Attack / confirm | E, Enter, Space | A |
| Back / close | Backspace, B, Esc | B |
| Pause menu | Esc or P | MENU |
| Sound | M | ♪ |

Motion respects `prefers-reduced-motion`.

## Development

```bash
npm install
npm run dev       # local dev server
npm run build     # type-check + production build into dist/
npm run preview   # serve the production build
```

Built with Vite and TypeScript. There's no framework and no runtime dependencies. The world renders on a canvas at its native 300px height and scales up with crisp pixels. HUD, dialogue and section panels are plain DOM. Sound effects are synthesized with WebAudio, so the game ships no audio files.

```
src/
  engine/   stage scaling, input, assets, chiptune sfx
  game/     world layout, guardians, effects, the game loop
  ui/       dialogue, HUD, menus, section panel content
  content.ts  every word and link from Yash's resume
public/
  art/        parallax layers, title and ending scenes
  sprites/    hero, guardians, effects, portraits
  portfolio/  Yash's renders
```

## Deploy

`.github/workflows/deploy.yml` builds the site and publishes it to GitHub Pages on every push to `main`. To turn it on, open **Settings → Pages** and set **Source** to **GitHub Actions**. Paths are relative (`base: "./"`), so the build also works from any static host or subfolder.

## Credits

- Game code and pixel art were made for this project.
- The 3D renders, Swamp Barn shots and sketches are © Yash Kamdar ([ArtStation](https://www.artstation.com/yaaaaashk)).
- The concept for *Abandoned Industry* is by ZC Wang.
- Fonts: [Press Start 2P](https://fonts.google.com/specimen/Press+Start+2P) and [Pixelify Sans](https://fonts.google.com/specimen/Pixelify+Sans), via Google Fonts.

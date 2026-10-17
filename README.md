# Yash Kamdar — A 3D Artist's Quest

The portfolio of **Yash Kamdar**, 3D Environment Artist, played as a 16-bit side-scrolling quest.

Run and jump across a pixel-art island, Mario style: hit ?-blocks, grab coins, and fight three guardians that each hold part of the portfolio.

| Guardian | Fight | Unlocks |
| --- | --- | --- |
| Slime King | 3 hits, doesn't fight back (a warm-up) | **About**: story, skills, tools |
| Stone Golem | 5 hits; slams the ground and sends quakes you jump over | **Work**: experience and training |
| Shadow Knight | 6 hits; backflips away, throws sword waves, dashes across the arena | **Portfolio**: renders, Swamp Barn shots, sketches |

Yash has five hearts. If you're knocked out, you respawn at the arena entrance and the guardian keeps the damage you dealt, so nobody gets stuck. Hit guardians with your sword, or land on their heads.

Each section opens on its own once you've earned it. To read another section, go and beat its guardian. Choosing a section from the title or the pause menu teleports the hero straight to that guardian. Sections you've already won can be reopened from the quest log or the pause menu.

The journey ends on a sunset hill where Yash meets his love, followed by the contact links.

Visitors who just want to read can pick **Quick View** on the title screen.

## Controls

| Action | Keyboard | Touch |
| --- | --- | --- |
| Move | ← → or A D | ◀ ▶ |
| Run | Shift, or keep holding a direction | hold ◀ ▶ |
| Jump (hold for higher) | Space, ↑, W, Z | A |
| Attack | J, X, E | B |
| Confirm dialogue | Enter | tap the button |
| Pause menu / close | Esc or P | MENU |
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
  game/     hero controller, guardian AI, world layout, effects, the game loop
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

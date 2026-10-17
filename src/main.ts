import "./styles.css";
import { loadImages } from "./engine/assets";
import { Input, type Action } from "./engine/input";
import { Stage } from "./engine/stage";
import { sfx } from "./engine/audio";
import { Game } from "./game/game";
import { UI } from "./ui/ui";

async function boot() {
  const ui = new UI();
  const stage = new Stage(document.querySelector<HTMLElement>("#stage")!);
  const input = new Input();

  // on-screen controls (shown on touch / portrait screens)
  const pad: [string, Action][] = [["#pad-left", "left"], ["#pad-right", "right"], ["#pad-a", "act"], ["#pad-b", "back"], ["#pad-menu", "menu"], ["#btn-menu", "menu"]];
  for (const [sel, a] of pad) input.bindButton(document.querySelector<HTMLElement>(sel)!, a);

  ui.setMuted(sfx.muted);
  document.querySelector("#btn-mute")!.addEventListener("click", () => { sfx.unlock(); ui.setMuted(sfx.toggleMute()); });
  addEventListener("keydown", (e) => { if (e.code === "KeyM") ui.setMuted(sfx.toggleMute()); });

  const images = await loadImages((d, t) => ui.loading(d, t));
  const game = new Game(stage, images, input, ui);
  document.querySelector("#credits-again")!.addEventListener("click", () => void game.playAgain());
  document.querySelector("#credits-explore")!.addEventListener("click", () => void game.keepExploring());
  document.querySelector("#credits-sections")!.addEventListener("click", () => ui.openPanel("portfolio"));
  await ui.hideLoading();
  game.start();
}

boot().catch((err) => {
  console.error(err);
  const el = document.querySelector("#loading");
  if (el) el.innerHTML = `<p class="loading__error">Couldn't start the game. <a href="https://www.artstation.com/yaaaaashk">See Yash's work on ArtStation</a>.</p>`;
});

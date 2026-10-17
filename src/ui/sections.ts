import { barnShots, contact, profile, projects, sketches, work } from "../content";

export type TabId = "about" | "work" | "portfolio" | "contact";
export const TABS: { id: TabId; label: string; title: string; sub: string }[] = [
  { id: "about", label: "About", title: "Who is Yash?", sub: "The Slime King's scroll" },
  { id: "work", label: "Work", title: "Quest History", sub: "The Stone Golem's ledger" },
  { id: "portfolio", label: "Portfolio", title: "The Vault", sub: "Every world Yash has built" },
  { id: "contact", label: "Contact", title: "Join the Party", sub: "Send Yash an invite" },
];

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
const asset = (p: string) => `${import.meta.env.BASE_URL}${p}`;

function about() {
  return `
  <div class="grid-2">
    <section class="card card--player">
      <h3 class="card__title">Player card</h3>
      <img class="pixel portrait-lg" src="${asset("sprites/portrait-hero.png")}" alt="" width="40" height="40">
      <p class="name">${esc(profile.name)}</p>
      <dl class="stats">
        <dt>Class</dt><dd>${esc(profile.role)}</dd>
        <dt>Also</dt><dd>${esc(profile.alsoKnownAs)}</dd>
        <dt>Base</dt><dd>${esc(profile.location)}</dd>
        <dt>Guild</dt><dd>BCA · DAVV</dd>
      </dl>
    </section>
    <div class="stack">
      <section class="card"><h3 class="card__title">Story</h3><p>${esc(profile.summary)}</p></section>
      <section class="card"><h3 class="card__title">Skills unlocked</h3>
        <ul class="skills">${profile.competencies.map(([n, d]) => `<li><strong>${esc(n)}</strong><span>${esc(d)}</span></li>`).join("")}</ul>
      </section>
      <section class="card"><h3 class="card__title">Perks &amp; inventory</h3>
        <ul class="chips">${profile.strengths.map((s) => `<li class="chip chip--gold">${esc(s)}</li>`).join("")}</ul>
        <ul class="chips">${profile.tools.map((s) => `<li class="chip">${esc(s)}</li>`).join("")}</ul>
      </section>
    </div>
  </div>`;
}

function workHtml() {
  const j = work.job;
  return `
  <section class="card">
    <h3 class="card__title">Main quest · completed</h3>
    <div class="job-head"><p class="name">${esc(j.title)} · ${esc(j.company)}</p><p class="date">${esc(j.dates)}</p></div>
    <ul class="bullets">${j.points.map((p) => `<li>${esc(p)}</li>`).join("")}</ul>
  </section>
  <div class="grid-3">
    ${work.side.map((s) => `<section class="card"><h3 class="card__title">Side quest · ${esc(s.label)}</h3><p class="name name--sm">${esc(s.title)}</p><p class="meta">${esc(s.meta)}</p></section>`).join("")}
  </div>`;
}

function portfolio() {
  return `
  <ul class="vault">
    ${projects.map((p) => `
      <li><a class="tile" href="${p.url}" target="_blank" rel="noopener">
        <img src="${asset(p.image)}" alt="${esc(p.title)} — ${esc(p.blurb)}" loading="lazy" width="1600" height="900">
        <span class="tile__title">${esc(p.title)}</span>
        <span class="tile__meta">${esc(p.meta)}</span>
      </a></li>`).join("")}
  </ul>
  <section class="card">
    <h3 class="card__title">Barn · detail shots</h3>
    <ul class="strip">${barnShots.map((s) => `<li><a href="${projects[0].url}" target="_blank" rel="noopener"><img src="${asset(s.image)}" alt="Barn ${esc(s.title.toLowerCase())} shot" loading="lazy"></a></li>`).join("")}</ul>
  </section>
  <section class="card">
    <h3 class="card__title">Sketchbook · ink &amp; dry media</h3>
    <ul class="strip strip--tall">${sketches.map((s) => `<li><a href="${s.url}" target="_blank" rel="noopener"><img src="${asset(s.image)}" alt="Sketch: ${esc(s.title)}" loading="lazy"><span>${esc(s.title)}</span></a></li>`).join("")}</ul>
  </section>`;
}

function contactHtml() {
  return `
  <section class="card">
    <h3 class="card__title">Ready to join your party</h3>
    <p>Yash is open to environment art roles in games and VFX. Choose an action:</p>
    <ul class="contact">${contact.map((c) => `<li><a class="btn btn--${c.key === "1" ? "gold" : "blue"}" href="${c.href}" ${c.href.startsWith("http") ? 'target="_blank" rel="noopener"' : ""}><kbd>${c.key}</kbd>${esc(c.label)}<small>${esc(c.value)}</small></a></li>`).join("")}</ul>
  </section>`;
}

export function renderTab(id: TabId) {
  switch (id) {
    case "about": return about();
    case "work": return workHtml();
    case "portfolio": return portfolio();
    case "contact": return contactHtml();
  }
}

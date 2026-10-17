// Everything the game teaches the player about Yash. Sourced from his résumé and ArtStation.

export type SectionId = "about" | "work" | "portfolio";

export const profile = {
  name: "Yash Kamdar",
  role: "3D Environment Artist",
  alsoKnownAs: "Game Designer · 3D Artist · Sketch Artist",
  location: "Indore, India",
  summary:
    "Motivated and creative 3D Environment Artist with solid foundations in modeling, texturing and scene assembly " +
    "using Blender, 3ds Max and Unreal Engine. Eager to bring artistic vision and technical skill to teams in game " +
    "development or VFX — with a strong eye for detail and a passion for crafting engaging, beautiful worlds.",
  competencies: [
    ["3D Modeling", "Natural and architectural elements in 3ds Max and Blender."],
    ["Texturing", "Realistic PBR textures and materials in Substance Painter."],
    ["Lighting", "Natural and artificial light that sets mood and depth."],
    ["UV Mapping & Baking", "Models prepared for efficient texturing and rendering."],
    ["Game Engines", "Assets integrated into real-time scenes in Unreal Engine."],
    ["Optimization", "Environments that run well without visual compromise."],
  ] as const,
  strengths: ["Artistic Vision", "Architectural Insight", "Attention to Detail", "Communication", "Team Collaboration"],
  tools: ["3ds Max", "Blender", "Substance Painter", "Unreal Engine", "V-Ray", "Quixel Bridge"],
};

export const work = {
  job: {
    title: "3D Artist Intern",
    company: "FireAntGames",
    dates: "Nov 2025 — May 2026",
    points: [
      "Created game-ready 3D environment assets and props using optimized workflows.",
      "Developed PBR textures and materials, ensuring visual quality and performance.",
      "Integrated assets into Unreal Engine for environment building, level dressing and lighting.",
      "Collaborated with the indie development team, keeping art style, scale and optimization consistent.",
    ],
  },
  side: [
    { label: "Education", title: "Bachelor of Computer Applications", meta: "DAVV · 2021 — 2025" },
    { label: "Certification", title: "DPW3D + Unreal Engine", meta: "MAAC" },
    { label: "Event", title: "Swamp Barn — 24FPS", meta: "MAAC · Nov 2023" },
  ],
};

export interface Project {
  title: string;
  image: string;
  url: string;
  meta: string;
  blurb: string;
}

const AS = "https://www.artstation.com/artwork/";
export const projects: Project[] = [
  { title: "Barn", image: "portfolio/barn.jpg", url: AS + "VJv1b8", meta: "3ds Max · Substance Painter · V-Ray",
    blurb: "An abandoned barn on stilts in a sunlit swamp, built for MAAC's 24FPS event." },
  { title: "Trash Raft", image: "portfolio/trash-raft.jpg", url: AS + "rl99gm", meta: "3ds Max · Substance · Unreal Engine",
    blurb: "A miniature raft of salvage, lit at night by strings of decorative lights." },
  { title: "Charging Station", image: "portfolio/charging-station.jpg", url: AS + "nJvA1e", meta: "3ds Max · Substance · Unreal Engine",
    blurb: "A late-night EV charging station with atmospheric fog and a moody grade." },
  { title: "Survival Base", image: "portfolio/survival-base.jpg", url: AS + "eRWgbP", meta: "3ds Max · Substance · Unreal Engine",
    blurb: "A container outpost in a vast post-apocalyptic world — modular storytelling." },
  { title: "Camping in Woods", image: "portfolio/camping-in-woods.jpg", url: AS + "EzEgWe", meta: "Unreal Engine · 3ds Max · Substance",
    blurb: "A cozy tent pitched in misty woods." },
  { title: "Abandoned Industry", image: "portfolio/abandoned-industry.jpg", url: AS + "dy8Rq3", meta: "Unreal Engine · concept by ZC Wang",
    blurb: "An industrial area abandoned for ages, inspired by concept art by ZC Wang." },
  { title: "Old Castle", image: "portfolio/old-castle.jpg", url: AS + "eRdwlG", meta: "Unreal Engine · free assets",
    blurb: "An old castle environment assembled in Unreal Engine." },
];

export const barnShots = [
  { title: "Boat", image: "portfolio/barn-boat.jpg" },
  { title: "Background", image: "portfolio/barn-background.jpg" },
  { title: "Pulley", image: "portfolio/barn-pulley.jpg" },
  { title: "Greyscale", image: "portfolio/barn-greyscale.jpg" },
];

export const sketches = [
  { title: "Creature from Hell", image: "portfolio/sketch-creature.jpg", url: AS + "ao8z2z" },
  { title: "Reaper", image: "portfolio/sketch-reaper.jpg", url: AS + "xY04DY" },
  { title: "Venom", image: "portfolio/sketch-venom.jpg", url: AS + "r9EPNa" },
  { title: "Goku", image: "portfolio/sketch-goku.jpg", url: AS + "ZegGxG" },
];

export const contact = [
  { label: "Email", value: "yashwork1303@gmail.com", href: "mailto:yashwork1303@gmail.com", key: "1" },
  { label: "LinkedIn", value: "yash-kamdar", href: "https://www.linkedin.com/in/yash-kamdar-326613184/", key: "2" },
  { label: "ArtStation", value: "yaaaaashk", href: "https://www.artstation.com/yaaaaashk", key: "3" },
  { label: "Call", value: "+91 86020 96668", href: "tel:+918602096668", key: "4" },
];

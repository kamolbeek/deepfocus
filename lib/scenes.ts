import type { CSSProperties } from "react";

// Kompanyon ortidagi sahnalar: rasm emas, faqat CSS gradient va naqshlar,
// shuning uchun yengil va har qanday ekranda tiniq chiqadi.
export type Scene = {
  id: string;
  name: string;
  price: number;
  minLevel: number;
  style: CSSProperties;
  dark?: boolean; // matn rangini moslash uchun
};

const stars =
  "radial-gradient(1.5px 1.5px at 12% 22%, #fff 99%, transparent), radial-gradient(1px 1px at 28% 68%, #fff 99%, transparent)," +
  "radial-gradient(1.5px 1.5px at 46% 18%, #fff 99%, transparent), radial-gradient(1px 1px at 62% 52%, #ffffffcc 99%, transparent)," +
  "radial-gradient(2px 2px at 78% 26%, #fff 99%, transparent), radial-gradient(1px 1px at 88% 72%, #ffffffaa 99%, transparent)," +
  "radial-gradient(1px 1px at 36% 40%, #ffffff99 99%, transparent), radial-gradient(1.5px 1.5px at 92% 12%, #fff 99%, transparent)";

export const SCENES: Scene[] = [
  { id: "plain", name: "Oddiy", price: 0, minLevel: 1, style: { background: "transparent" } },
  {
    id: "lavender",
    name: "Lavanda",
    price: 50,
    minLevel: 1,
    style: { background: "linear-gradient(160deg, #F1EEFF 0%, #E4DEFF 55%, #D9D2FB 100%)" },
  },
  {
    id: "dawn",
    name: "Tong",
    price: 120,
    minLevel: 2,
    style: { background: "linear-gradient(170deg, #FFF3E6 0%, #FFE1D3 50%, #FBCFD8 100%)" },
  },
  {
    id: "garden",
    name: "Bog'",
    price: 200,
    minLevel: 3,
    style: {
      background:
        "radial-gradient(120% 60% at 50% 115%, #BFE8C9 0%, #BFE8C900 60%), linear-gradient(180deg, #EAF7EE 0%, #DDF1E3 100%)",
    },
  },
  {
    id: "ocean",
    name: "Okean",
    price: 350,
    minLevel: 4,
    style: {
      background:
        "radial-gradient(140% 55% at 50% 120%, #8FD3F4 0%, #8FD3F400 65%), linear-gradient(180deg, #E6F6FD 0%, #CDEBFA 100%)",
    },
  },
  {
    id: "night",
    name: "Yulduzli tun",
    price: 500,
    minLevel: 5,
    dark: true,
    style: { background: `${stars}, radial-gradient(120% 90% at 50% 0%, #34336A 0%, #1C1B3A 70%)` },
  },
  {
    id: "aurora",
    name: "Shimol yog'dusi",
    price: 800,
    minLevel: 7,
    dark: true,
    style: {
      background:
        `${stars}, radial-gradient(60% 45% at 30% 30%, #48E0B455 0%, transparent 70%), radial-gradient(55% 40% at 72% 22%, #9B7BFF66 0%, transparent 70%), linear-gradient(180deg, #14213D 0%, #0E1428 100%)`,
    },
  },
];

export const sceneById = (id?: string) => SCENES.find((s) => s.id === id) ?? SCENES[0];

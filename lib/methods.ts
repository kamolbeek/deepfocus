// Samaradorlik usullari: har biri taymerni o'zicha boshqaradi.
export type Activity = "dars" | "ish" | "ijod" | "sport";

export type Method = {
  id: string;
  name: string;
  badge: string; // qisqa ko'rinish: "25 / 5"
  unit: "min" | "sec";
  focus: number;
  short: number;
  long: number;
  longEvery: number;
  flow?: boolean; // Flowtime: taymer o'sib boradi, tanaffus = ishning 1/5 qismi
  labels?: { focus: string; short: string; long: string };
  rule: string; // bir gapda qoidasi
  best: Activity[];
  bestText: string; // qaysi ishlarga mos
  steps: string[]; // qanday qilinadi
};

export const ACTIVITY_LABEL: Record<Activity, string> = {
  dars: "Dars",
  ish: "Ish",
  ijod: "Ijod va kod",
  sport: "Sport",
};

export const METHODS: Method[] = [
  {
    id: "pomodoro",
    name: "Pomodoro",
    badge: "25 / 5",
    unit: "min",
    focus: 25,
    short: 5,
    long: 15,
    longEvery: 4,
    rule: "25 daqiqa faqat bitta ish, keyin 5 daqiqa dam. Har 4 sprintdan keyin 15 daqiqa katta tanaffus.",
    best: ["dars", "ish"],
    bestText: "Uy vazifasi, mayda ishlar, xat va qo'ng'iroqlar, boshlash qiyin bo'lgan har qanday ish.",
    steps: [
      "Bitta vazifani tanlang va telefonni ko'zdan uzoqlashtiring.",
      "25 daqiqa davomida faqat shu ish bilan shug'ullaning. Boshqa fikr kelsa, qog'ozga yozib qo'ying.",
      "Tanaffusda ekrandan uzoqlashing: suv iching, cho'ziling.",
      "4 ta sprintdan keyin 15 daqiqa yaxshilab dam oling.",
    ],
  },
  {
    id: "5010",
    name: "50 / 10",
    badge: "50 / 10",
    unit: "min",
    focus: 50,
    short: 10,
    long: 30,
    longEvery: 3,
    rule: "Universitet darsi kabi: 50 daqiqa o'qish, 10 daqiqa dam. 3 ta blokdan keyin 30 daqiqa tanaffus.",
    best: ["dars"],
    bestText: "Imtihonga tayyorlanish (DTM, IELTS, SAT), uzun mavzular, kitob o'qish, konspekt.",
    steps: [
      "Boshlashdan oldin blokning maqsadini yozing: masalan, \"2-bob, 20 ta test\".",
      "50 daqiqa o'qing va yozib boring. Faqat o'qib chiqish yetmaydi, o'zingizni tekshirib boring.",
      "Tanaffusda o'qiganingizni ichingizda 1 daqiqa takrorlang, keyin dam oling.",
      "Kuniga 3–4 blok yetarli, undan ko'pi xotirani charchatadi.",
    ],
  },
  {
    id: "5217",
    name: "52 / 17",
    badge: "52 / 17",
    unit: "min",
    focus: 52,
    short: 17,
    long: 17,
    longEvery: 99,
    rule: "Eng samarali xodimlar kuzatilganda topilgan ritm: 52 daqiqa to'liq ish, 17 daqiqa to'liq dam.",
    best: ["ish"],
    bestText: "Ofis ishi, hisobotlar, jadvallar, mijozlar bilan yozishmalar, rejalashtirish.",
    steps: [
      "52 daqiqada faqat ishlaysiz: chat va ijtimoiy tarmoqlar yopiq.",
      "17 daqiqa haqiqiy dam: yuring, gaplashing, ekranga qaramang.",
      "Kunda 4–5 marta takrorlash 8 soatlik ish kunini to'liq qoplaydi.",
    ],
  },
  {
    id: "ultradian",
    name: "90 daqiqa",
    badge: "90 / 20",
    unit: "min",
    focus: 90,
    short: 20,
    long: 30,
    longEvery: 2,
    rule: "Miya taxminan 90 daqiqalik to'lqinlarda ishlaydi: bitta chuqur blok, keyin 20 daqiqa to'liq dam.",
    best: ["ish", "ijod"],
    bestText: "Kod yozish, dizayn, maqola, murakkab masala yoki loyiha. Chalg'imasdan uzoq o'ylash kerak bo'lgan ishlar.",
    steps: [
      "Kunning eng tetik vaqtini tanlang, ko'pchilikda bu ertalab bo'ladi.",
      "Bitta katta vazifa oling, bildirishnomalarni butunlay o'chiring.",
      "90 daqiqadan keyin albatta to'xtang, aks holda sifat tushadi.",
      "Kuniga 2–3 ta blok qilsangiz yetadi.",
    ],
  },
  {
    id: "flowtime",
    name: "Flowtime",
    badge: "Erkin",
    unit: "min",
    focus: 0,
    short: 5,
    long: 15,
    longEvery: 99,
    flow: true,
    rule: "Taymer o'sib boradi: oqimga tushsangiz uzilmaysiz. Charchaganda to'xtatasiz, tanaffus ishning 1/5 qismiga teng bo'ladi.",
    best: ["ijod", "ish"],
    bestText: "Ilhom kelgan payt, ijodiy ish, kod, yozuv. Pomodoro uzib qo'yadigan ishlar uchun.",
    steps: [
      "\"Boshlash\" tugmasini bosing va ishlayvering, taymer to'xtamaydi.",
      "Diqqat tarqalganini sezganingizda \"Tanaffus\" tugmasini bosing.",
      "Ilova tanaffusni o'zi hisoblaydi: 50 daqiqa ishlasangiz, 10 daqiqa dam olasiz.",
    ],
  },
  {
    id: "start10",
    name: "10 daqiqa",
    badge: "10 / 2",
    unit: "min",
    focus: 10,
    short: 2,
    long: 5,
    longEvery: 3,
    rule: "Dangasalikka qarshi: \"faqat 10 daqiqa qilaman\" deb boshlang. Ko'pincha boshlagandan keyin to'xtagingiz kelmaydi.",
    best: ["dars", "ish"],
    bestText: "Hech boshlay olmayotgan ishlar, uy ishlari, xona yig'ishtirish, kechiktirib kelgan vazifalar.",
    steps: [
      "O'zingizga faqat 10 daqiqa va'da bering, undan ortiq emas.",
      "Ish yoqib qolsa, keyingi sprintni boshlayvering. Yoqmasa, 10 daqiqa ham yutuq.",
      "Keyinroq Pomodoro yoki 50 / 10 usuliga o'ting.",
    ],
  },
  {
    id: "tabata",
    name: "Tabata",
    badge: "20s / 10s × 8",
    unit: "sec",
    focus: 20,
    short: 10,
    long: 60,
    longEvery: 8,
    labels: { focus: "Harakat", short: "Dam", long: "Katta dam" },
    rule: "20 soniya to'liq kuch bilan mashq, 10 soniya dam, 8 marta. Hammasi 4 daqiqa davom etadi va juda samarali.",
    best: ["sport"],
    bestText: "Uyda mashq, isinish, yog' yoqish: berpi, o'tirib-turish, otjimaniye, joyida yugurish.",
    steps: [
      "Bitta mashqni tanlang, masalan o'tirib-turish yoki otjimaniye.",
      "20 soniya iloji boricha tez va to'g'ri bajaring.",
      "10 soniya dam olib, yana davom eting. Jami 8 raund bo'ladi.",
      "Raundlardan keyin 1 daqiqa dam oling va xohlasangiz yana bir to'plam qiling.",
    ],
  },
];

export const methodById = (id?: string) => METHODS.find((m) => m.id === id);

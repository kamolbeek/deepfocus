"use client";

import dynamic from "next/dynamic";

// Taymer vaqt va localStorage bilan ishlaydi — faqat brauzerda render qilinadi
const App = dynamic(() => import("@/components/App"), {
  ssr: false,
  loading: () => <div className="min-h-dvh bg-[#F5F5F7]" />,
});

export default function ClientApp() {
  return <App />;
}

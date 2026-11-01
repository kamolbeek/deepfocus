"use client";

// Document Picture-in-Picture: hamma dasturlar ustida turadigan kichik oyna (Chrome/Edge kompyuterda)
type DocPiP = { requestWindow: (o: { width: number; height: number }) => Promise<Window> };

export const pipSupported = () =>
  typeof window !== "undefined" && "documentPictureInPicture" in window && window.top === window;

export async function openPip(width = 300, height = 380): Promise<Window | null> {
  const api = (window as unknown as { documentPictureInPicture?: DocPiP }).documentPictureInPicture;
  if (!api) return null;
  const pw = await api.requestWindow({ width, height });
  // Asosiy sahifaning uslublarini yangi oynaga ko'chiramiz
  for (const sheet of Array.from(document.styleSheets)) {
    try {
      const css = Array.from(sheet.cssRules)
        .map((r) => r.cssText)
        .join("\n");
      const style = pw.document.createElement("style");
      style.textContent = css;
      pw.document.head.appendChild(style);
    } catch {
      if (sheet.href) {
        const link = pw.document.createElement("link");
        link.rel = "stylesheet";
        link.href = sheet.href;
        pw.document.head.appendChild(link);
      }
    }
  }
  pw.document.title = "DeepFokus";
  pw.document.documentElement.lang = "uz";
  pw.document.body.style.margin = "0";
  pw.document.body.style.background = "#F5F5F7";
  return pw;
}

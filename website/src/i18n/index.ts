import en, { type Strings } from "./en";
import ptBr from "./pt-br";

export type Lang = "en" | "pt-br";

export const REPO = "https://github.com/HeyyCzer/windows-dynamic-island";
export const DOWNLOAD = `${REPO}/releases/latest`;

/** Path of a page in the given language, with the GitHub Pages base. */
export function href(lang: Lang, page: "" | "privacy" = ""): string {
  const base = import.meta.env.BASE_URL.replace(/\/$/, "");
  const prefix = lang === "en" ? "" : `/${lang}`;
  return `${base}${prefix}/${page ? `${page}/` : ""}`;
}

export const strings: Record<Lang, Strings> = { en, "pt-br": ptBr };

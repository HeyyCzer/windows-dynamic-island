import { defineCollection } from "astro:content";
import { glob } from "astro/loaders";

// The policy stays in docs/privacy so it can be read on GitHub too:
// index.md is the English original, pt-BR.md its translation.
const privacy = defineCollection({
  loader: glob({ pattern: "*.md", base: "../docs/privacy" }),
});

export const collections = { privacy };

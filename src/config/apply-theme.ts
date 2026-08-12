import { companyConfig } from "@/config/company";

const TOKEN_MAP = {
  primary: "--primary",
  secondary: "--secondary",
  sidebar: "--sidebar",
  sidebarForeground: "--sidebar-foreground",
  header: "--header",
  background: "--background",
  text: "--foreground",
  button: "--button",
  accent: "--accent",
} as const;

function toDeclarations(colors: Record<keyof typeof TOKEN_MAP, string>) {
  return Object.entries(TOKEN_MAP)
    .map(([key, cssVar]) => `${cssVar}:${colors[key as keyof typeof TOKEN_MAP]};`)
    .join("");
}

/**
 * Renders the branding colors from company.ts as a CSS string that
 * overrides the default tokens in globals.css. Rendered once in the
 * root layout so editing company.ts changes the whole app immediately,
 * no build step involved.
 */
export function getThemeCss(): string {
  const { light, dark } = companyConfig.colors;
  return `:root{${toDeclarations(light)}}.dark{${toDeclarations(dark)}}`;
}

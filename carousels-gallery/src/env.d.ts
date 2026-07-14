/// <reference path="../.astro/types.d.ts" />

declare namespace astroHTML.JSX {
  interface ButtonHTMLAttributes {
    command?: string | undefined | null;
    commandfor?: string | undefined | null;
  }
}

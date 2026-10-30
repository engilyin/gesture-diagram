declare module "node:fs" {
  export function readFileSync(
    path: string | URL,
    options: "utf8" | { encoding: "utf8" },
  ): string;
}

declare module "node:path" {
  export function resolve(...paths: string[]): string;
}

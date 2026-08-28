import { parse } from "yaml";

export function parseYaml(source) {
  return parse(source);
}

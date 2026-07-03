import type { ConnectionConfig } from "../types";

export function defineConnection(config: ConnectionConfig): ConnectionConfig {
  if (!config.name || !config.description) {
    throw new Error("Connection must have name and description");
  }
  if (!config.auth?.type) {
    throw new Error("Connection must have an auth type");
  }
  return config;
}

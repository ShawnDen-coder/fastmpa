import { OpenRouterModel } from "@shawnden-coder/agent-core";
import {
  createApplication,
  type FastMpaApplication,
  type FastMpaApplicationOptions,
} from "./application.js";
export function bootstrap(
  options: Omit<FastMpaApplicationOptions, "model"> & {
    model?: FastMpaApplicationOptions["model"];
  },
): Promise<FastMpaApplication> {
  return createApplication({
    ...options,
    model:
      options.model ??
      new OpenRouterModel({
        apiKey: process.env.OPENROUTER_API_KEY ?? "",
        model: process.env.OPENROUTER_MODEL ?? "",
        baseUrl: process.env.OPENROUTER_BASE_URL,
        httpReferer: process.env.OPENROUTER_HTTP_REFERER,
        appTitle: process.env.OPENROUTER_APP_TITLE ?? "FastMPA",
      }),
  });
}

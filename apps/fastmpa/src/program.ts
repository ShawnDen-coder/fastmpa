import { Command } from "commander";
import {
  auditRequirementIterations,
  formatIterationAuditReport,
  TapdHttpClient,
} from "integrations";
import { loadTapdFixture } from "./tapd-fixture.js";

export function createProgram(): Command {
  const program = new Command();

  program.name("fastmpa").description("A command-line tool.").version("0.1.0");

  program
    .command("hello")
    .description("Print a greeting.")
    .option("-n, --name <name>", "Name to greet.", "World")
    .action((options: { name: string }) => {
      console.log(`Hello, ${options.name}!`);
    });

  program
    .command("tapd-audit")
    .description(
      "Audit TAPD requirement iterations from a fixture or TAPD API.",
    )
    .option("-f, --file <path>", "TAPD fixture JSON file.")
    .requiredOption("-p, --project <projectId>", "TAPD project ID.")
    .requiredOption(
      "-i, --iteration <iteration>",
      "Expected TAPD iteration ID.",
    )
    .option("--api-user <user>", "TAPD API user; defaults to TAPD_API_USER.")
    .option(
      "--api-password <password>",
      "TAPD API password; defaults to TAPD_API_PASSWORD.",
    )
    .option("--base-url <url>", "TAPD API base URL.", "https://api.tapd.cn")
    .option("--json", "Print the structured report as JSON.")
    .action(
      async (options: {
        file?: string;
        project: string;
        iteration: string;
        apiUser?: string;
        apiPassword?: string;
        baseUrl: string;
        json?: boolean;
      }) => {
        const client = options.file
          ? await loadTapdFixture(options.file)
          : new TapdHttpClient({
              apiUser: options.apiUser ?? process.env.TAPD_API_USER ?? "",
              apiPassword:
                options.apiPassword ?? process.env.TAPD_API_PASSWORD ?? "",
              baseUrl: options.baseUrl,
            });
        const report = await auditRequirementIterations(client, {
          projectId: options.project,
          expectedIteration: options.iteration,
        });
        console.log(
          options.json
            ? JSON.stringify(report, null, 2)
            : formatIterationAuditReport(report),
        );
      },
    );

  return program;
}

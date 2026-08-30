import { createLogger } from "@shawnden-coder/agent-core";
import { Command } from "commander";
import { bootstrap } from "./bootstrap.js";
import { launchTui } from "./launch-tui.js";

export function createProgram(): Command {
  const program = new Command();

  program
    .name("fastmpa")
    .description("FastMPA agent workspace")
    .version("0.1.0");

  program
    .command("chat")
    .description("进入持续对话工作台")
    .action(async () => launchTui());

  program
    .command("doctor")
    .description("检查 SQLite 与演示 Agent 配置")
    .action(async () => {
      const app = await bootstrap({
        databasePath: process.env.FASTMPA_DB ?? "fastmpa.sqlite",
        logger: createLogger(undefined, {
          component: "application",
          pretty: true,
        }),
      });
      try {
        await app.start();
        console.log("SQLite: ok\nDemo Agent: ok");
      } finally {
        await app.stop();
      }
    });

  program
    .command("run")
    .argument("<task>", "要提交的任务")
    .option("-a, --agent <agentId>", "Agent ID", "demo-agent")
    .action(async (task: string, options: { agent: string }) => {
      const app = await bootstrap({
        databasePath: process.env.FASTMPA_DB ?? "fastmpa.sqlite",
        logger: createLogger(undefined, {
          component: "application",
          pretty: true,
        }),
      });
      try {
        await app.start();
        console.log(
          JSON.stringify(
            await app.dispatch({
              type: "submit",
              workspaceId: "default",
              conversationId: "default",
              body: task,
              agentId: options.agent,
            }),
            null,
            2,
          ),
        );
      } finally {
        await app.stop();
      }
    });

  return program;
}

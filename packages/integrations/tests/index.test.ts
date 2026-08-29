import { describe, expect, it } from "vitest";
import { TapdApiError, TapdHttpClient } from "../src/tapd/http-client.js";
import {
  auditRequirementIterations,
  buildIterationAuditMessage,
  createTapdReadonlyTools,
  createTapdWriteTools,
  formatIterationAuditReport,
  verifyTapdUpdate,
} from "../src/tapd/index.js";

describe("TAPD integration", () => {
  it("audits every page and reports missing or unexpected iterations", async () => {
    const pages = new Map([
      [
        1,
        {
          items: [
            {
              id: "r-1",
              title: "First",
              projectId: "7A",
              iteration: "Sprint 1",
            },
          ],
          nextPage: 2,
        },
      ],
      [
        2,
        {
          items: [
            { id: "r-2", title: "Second", projectId: "7A", iteration: null },
            {
              id: "r-3",
              title: "Third",
              projectId: "7A",
              iteration: "Sprint 2",
            },
          ],
        },
      ],
    ]);
    const report = await auditRequirementIterations(
      {
        listRequirements: async ({ page }) => pages.get(page) ?? { items: [] },
      },
      { projectId: "7A", expectedIteration: "Sprint 1" },
    );
    expect(formatIterationAuditReport(report)).toContain("修改前需要你的确认");
    expect(
      buildIterationAuditMessage(report, {
        id: "message-report",
        workspaceId: "workspace-1",
        conversationId: "conversation-1",
        senderId: "agent-1",
        createdAt: "2026-01-01T00:01:00.000Z",
      }),
    ).toMatchObject({
      id: "message-report",
      body: expect.stringContaining("发现 2 条异常"),
    });
    expect(report.inspectedCount).toBe(3);
    expect(
      report.findings.map((finding) => [finding.requirementId, finding.reason]),
    ).toEqual([
      ["r-2", "missing"],
      ["r-3", "unexpected"],
    ]);
  });

  it("exposes the audit as a read-only Tool Pipeline tool", async () => {
    const [tool] = createTapdReadonlyTools({
      listRequirements: async () => ({
        items: [
          { id: "r-1", title: "First", projectId: "7A", iteration: "Sprint 1" },
        ],
      }),
    });
    expect(tool.effect).toBe("read");
    const result = await tool.execute({
      projectId: "7A",
      expectedIteration: "Sprint 1",
    });
    expect(result).toEqual({
      projectId: "7A",
      expectedIteration: "Sprint 1",
      inspectedCount: 1,
      findings: [],
    });
  });

  it("exposes writes separately with an expected old value", async () => {
    const calls: unknown[] = [];
    const [tool] = createTapdWriteTools({
      listRequirements: async () => ({ items: [] }),
      updateRequirementIteration: async (input) => {
        calls.push(input);
        return {
          receiptId: "receipt-1",
          requirementId: input.requirementId,
          iteration: input.newIteration,
        };
      },
    });
    expect(tool.effect).toBe("write");
    await tool.execute({
      projectId: "7A",
      requirementId: "r-2",
      expectedIteration: null,
      newIteration: "Sprint 1",
    });
    expect(calls).toEqual([
      {
        projectId: "7A",
        requirementId: "r-2",
        expectedIteration: null,
        newIteration: "Sprint 1",
      },
    ]);
  });

  it("maps TAPD HTTP responses and sends Basic authentication", async () => {
    let requestedUrl = "";
    let requestedHeaders: HeadersInit | undefined;
    const client = new TapdHttpClient({
      apiUser: "api-user",
      apiPassword: "api-password",
      baseUrl: "https://tapd.example.test",
      fetch: async (input, init) => {
        requestedUrl = String(input);
        requestedHeaders = init?.headers;
        return new Response(
          JSON.stringify({
            status: 1,
            info: "success",
            data: [
              {
                Story: {
                  id: "r-1",
                  name: "Requirement",
                  workspace_id: "7A",
                  iteration_id: "iteration-1",
                  url: "https://tapd.example.test/story/r-1",
                },
              },
            ],
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      },
    });

    const page = await client.listRequirements({
      projectId: "7A",
      page: 2,
      pageSize: 50,
    });
    const url = new URL(requestedUrl);
    expect(url.pathname).toBe("/stories");
    expect(url.searchParams.get("workspace_id")).toBe("7A");
    expect(url.searchParams.get("limit")).toBe("50");
    expect(url.searchParams.get("page")).toBe("2");
    expect(requestedHeaders).toMatchObject({
      authorization: `Basic ${btoa("api-user:api-password")}`,
    });
    expect(page.items[0]).toEqual({
      id: "r-1",
      title: "Requirement",
      projectId: "7A",
      iteration: "iteration-1",
      url: "https://tapd.example.test/story/r-1",
    });
  });

  it("checks the old iteration before issuing a write", async () => {
    const calls: Array<{ method: string; body?: string }> = [];
    const client = new TapdHttpClient({
      apiUser: "u",
      apiPassword: "p",
      fetch: async (_input, init) => {
        calls.push({
          method: init?.method ?? "GET",
          body:
            typeof init?.body === "string"
              ? init.body
              : init?.body instanceof URLSearchParams
                ? init.body.toString()
                : undefined,
        });
        if (init?.method === "POST")
          return new Response(
            JSON.stringify({
              status: 1,
              data: {
                Story: { id: "r-1", name: "R", iteration_id: "iteration-2" },
              },
            }),
            { status: 200 },
          );
        return new Response(
          JSON.stringify({
            status: 1,
            data: [
              {
                Story: {
                  id: "r-1",
                  name: "R",
                  workspace_id: "7A",
                  iteration_id: "iteration-1",
                },
              },
            ],
          }),
          { status: 200 },
        );
      },
    });

    await client.updateRequirementIteration({
      projectId: "7A",
      requirementId: "r-1",
      expectedIteration: "iteration-1",
      newIteration: "iteration-2",
    });
    expect(calls).toHaveLength(2);
    expect(calls[1]).toMatchObject({
      method: "POST",
      body: expect.stringContaining("iteration_id=iteration-2"),
    });
  });

  it("finds the write target across TAPD pagination", async () => {
    const requests: Array<{ page: number; method: string }> = [];
    const firstPage = Array.from({ length: 200 }, (_, index) => ({
      id: `r-${index}`,
      name: `R${index}`,
      projectId: "7A",
      iteration: null,
    }));
    const client = new TapdHttpClient({
      apiUser: "u",
      apiPassword: "p",
      fetch: async (input, init) => {
        const url = new URL(String(input));
        requests.push({
          page: Number(url.searchParams.get("page") ?? 0),
          method: init?.method ?? "GET",
        });
        if (init?.method === "POST")
          return new Response(
            JSON.stringify({
              status: 1,
              data: {
                Story: {
                  id: "r-target",
                  name: "Target",
                  iteration_id: "iteration-2",
                },
              },
            }),
            { status: 200 },
          );
        const page = Number(url.searchParams.get("page"));
        return new Response(
          JSON.stringify({
            status: 1,
            data:
              page === 1
                ? firstPage
                : [
                    {
                      id: "r-target",
                      name: "Target",
                      workspace_id: "7A",
                      iteration_id: null,
                    },
                  ],
          }),
          { status: 200 },
        );
      },
    });
    await client.updateRequirementIteration({
      projectId: "7A",
      requirementId: "r-target",
      expectedIteration: null,
      newIteration: "iteration-2",
    });
    expect(requests).toEqual([
      { page: 1, method: "GET" },
      { page: 2, method: "GET" },
      { page: 0, method: "POST" },
    ]);
  });

  it("classifies read throttling as retryable", async () => {
    const client = new TapdHttpClient({
      apiUser: "u",
      apiPassword: "p",
      fetch: async () =>
        new Response(JSON.stringify({ status: 0, info: "too many requests" }), {
          status: 429,
        }),
    });
    await expect(
      client.listRequirements({ projectId: "7A", page: 1, pageSize: 10 }),
    ).rejects.toMatchObject({
      name: "TapdApiError",
      code: "tapd_api_error",
      statusCode: 429,
      retryable: true,
      info: "too many requests",
    });
  });

  it("never marks a write transport failure as safe to replay", async () => {
    const client = new TapdHttpClient({
      apiUser: "u",
      apiPassword: "p",
      fetch: async (_input, init) =>
        new Response(
          JSON.stringify(
            init?.method === "POST"
              ? { status: 0, info: "upstream unavailable" }
              : {
                  status: 1,
                  data: [
                    { Story: { id: "r-1", name: "R", iteration_id: null } },
                  ],
                },
          ),
          { status: init?.method === "POST" ? 503 : 200 },
        ),
    });
    await expect(
      client.updateRequirementIteration({
        projectId: "7A",
        requirementId: "r-1",
        expectedIteration: null,
        newIteration: "iteration-2",
      }),
    ).rejects.toMatchObject({
      name: "TapdApiError",
      statusCode: 503,
      retryable: false,
    });
  });

  it("wraps network failures with a retryable read error", async () => {
    const client = new TapdHttpClient({
      apiUser: "u",
      apiPassword: "p",
      fetch: async () => {
        throw new Error("socket closed");
      },
    });
    await expect(
      client.listRequirements({ projectId: "7A", page: 1, pageSize: 10 }),
    ).rejects.toBeInstanceOf(TapdApiError);
    await expect(
      client.listRequirements({ projectId: "7A", page: 1, pageSize: 10 }),
    ).rejects.toMatchObject({ retryable: true });
  });

  it("classifies an unknown write outcome without replaying the write", async () => {
    const client = {
      listRequirements: async () => ({
        items: [
          { id: "r-1", title: "R", projectId: "7A", iteration: "iteration-2" },
        ],
      }),
    };
    await expect(
      verifyTapdUpdate(client, {
        projectId: "7A",
        requirementId: "r-1",
        expectedIteration: null,
        targetIteration: "iteration-2",
      }),
    ).resolves.toMatchObject({
      currentIteration: "iteration-2",
      outcome: "applied",
    });

    const outcomes = [null, "iteration-3"] as const;
    for (const [index, currentIteration] of outcomes.entries()) {
      await expect(
        verifyTapdUpdate(
          {
            listRequirements: async () => ({
              items: [
                {
                  id: "r-1",
                  title: "R",
                  projectId: "7A",
                  iteration: currentIteration,
                },
              ],
            }),
          },
          {
            projectId: "7A",
            requirementId: "r-1",
            expectedIteration: null,
            targetIteration: "iteration-2",
          },
        ),
      ).resolves.toMatchObject({
        outcome: index === 0 ? "not_applied" : "conflict",
      });
    }
  });
});

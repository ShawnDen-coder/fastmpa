import type {
  TapdReadonlyClient,
  TapdRequirementPage,
  TapdWriteClient,
} from "./index.js";

export interface TapdHttpClientOptions {
  baseUrl?: string;
  apiUser: string;
  apiPassword: string;
  fetch?: typeof fetch;
}

/** TAPD 请求失败的可序列化投影；写入失败默认不可自动重放。 */
export class TapdApiError extends Error {
  public readonly code = "tapd_api_error";
  public constructor(
    message: string,
    public readonly statusCode?: number,
    public readonly retryable = false,
    public readonly info?: string,
    options?: { cause?: unknown },
  ) {
    super(message, options);
    this.name = "TapdApiError";
  }
}

interface TapdResponse {
  status?: number;
  info?: string;
  data?: unknown;
}

export class TapdHttpClient implements TapdWriteClient, TapdReadonlyClient {
  private readonly baseUrl: string;
  private readonly request: typeof fetch;

  public constructor(private readonly options: TapdHttpClientOptions) {
    if (!options.apiUser || !options.apiPassword)
      throw new Error("TAPD API credentials are required");
    this.baseUrl = (options.baseUrl ?? "https://api.tapd.cn").replace(
      /\/$/,
      "",
    );
    this.request = options.fetch ?? fetch;
  }

  public async listRequirements(input: {
    projectId: string;
    page: number;
    pageSize: number;
  }): Promise<TapdRequirementPage> {
    if (input.page < 1 || input.pageSize < 1 || input.pageSize > 200)
      throw new Error(
        "TAPD page must be positive and pageSize must be between 1 and 200",
      );
    const url = new URL(`${this.baseUrl}/stories`);
    url.searchParams.set("workspace_id", input.projectId);
    url.searchParams.set("limit", String(input.pageSize));
    url.searchParams.set("page", String(input.page));
    url.searchParams.set("fields", "id,name,workspace_id,iteration_id");
    const response = await this.fetch(url, { headers: this.headers() });
    const payload = await this.readResponse(response, false);
    if (!Array.isArray(payload.data))
      throw new Error("TAPD stories response data is not a list");
    const items = payload.data.map((item) =>
      toRequirement(item, input.projectId),
    );
    return {
      items,
      ...(items.length === input.pageSize ? { nextPage: input.page + 1 } : {}),
    };
  }

  public async updateRequirementIteration(input: {
    projectId: string;
    requirementId: string;
    expectedIteration: string | null;
    newIteration: string;
  }): Promise<{ receiptId: string; requirementId: string; iteration: string }> {
    const current = await this.findRequirement(
      input.projectId,
      input.requirementId,
    );
    if ((current.iteration ?? null) !== input.expectedIteration)
      throw new Error(
        `TAPD requirement ${input.requirementId} changed before update`,
      );
    const body = new URLSearchParams({
      id: input.requirementId,
      workspace_id: input.projectId,
      iteration_id: input.newIteration,
    });
    const response = await this.fetch(`${this.baseUrl}/stories`, {
      method: "POST",
      headers: {
        ...this.headers(),
        "content-type": "application/x-www-form-urlencoded",
      },
      body,
    });
    const payload = await this.readResponse(response, true);
    const updated = toRequirement(
      { Story: payload.data && isRecord(payload.data) && payload.data.Story },
      input.projectId,
    );
    return {
      receiptId: updated.id,
      requirementId: updated.id,
      iteration: updated.iteration ?? input.newIteration,
    };
  }

  private async findRequirement(projectId: string, requirementId: string) {
    let page = 1;
    while (true) {
      const result = await this.listRequirements({
        projectId,
        page,
        pageSize: 200,
      });
      const found = result.items.find((item) => item.id === requirementId);
      if (found) return found;
      if (result.nextPage === undefined) break;
      if (result.nextPage <= page)
        throw new Error("TAPD client returned a non-increasing page cursor");
      page = result.nextPage;
    }
    throw new Error(`TAPD requirement not found: ${requirementId}`);
  }

  private headers(): HeadersInit {
    return {
      accept: "application/json",
      authorization: `Basic ${btoa(`${this.options.apiUser}:${this.options.apiPassword}`)}`,
    };
  }

  private async fetch(
    input: RequestInfo | URL,
    init: RequestInit,
  ): Promise<Response> {
    try {
      return await this.request(input, init);
    } catch (error) {
      if (error instanceof TapdApiError) throw error;
      throw new TapdApiError(
        "TAPD API request could not be completed",
        undefined,
        init.method !== "POST",
        undefined,
        { cause: error },
      );
    }
  }

  private async readResponse(
    response: Response,
    isWrite: boolean,
  ): Promise<TapdResponse> {
    let payload: TapdResponse;
    try {
      payload = (await response.json()) as TapdResponse;
    } catch (error) {
      throw new TapdApiError(
        "TAPD API returned invalid JSON",
        response.status,
        !isWrite && response.status >= 500,
        undefined,
        { cause: error },
      );
    }
    if (!response.ok)
      throw new TapdApiError(
        `TAPD API request failed: HTTP ${response.status}`,
        response.status,
        !isWrite && (response.status === 429 || response.status >= 500),
        payload.info,
      );
    if (payload.status !== 1)
      throw new TapdApiError(
        `TAPD API rejected request: ${payload.info ?? "unknown error"}`,
        response.status,
        false,
        payload.info,
      );
    return payload;
  }
}

function toRequirement(value: unknown, fallbackProjectId: string) {
  const story = isRecord(value) && isRecord(value.Story) ? value.Story : value;
  if (
    !isRecord(story) ||
    typeof story.id !== "string" ||
    typeof story.name !== "string"
  )
    throw new Error("TAPD story response is malformed");
  const iterationId = story.iteration_id;
  return {
    id: story.id,
    title: story.name,
    projectId:
      typeof story.workspace_id === "string"
        ? story.workspace_id
        : fallbackProjectId,
    iteration:
      typeof iterationId === "string" &&
      iterationId !== "" &&
      iterationId !== "0"
        ? iterationId
        : null,
    ...(typeof story.url === "string" ? { url: story.url } : {}),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

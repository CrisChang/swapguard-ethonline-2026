// Server-side diagnostics must never log raw viem errors: they contain RPC URLs,
// calldata and optional public wallet addresses. Emit only allowlisted categories.
export function rpcDiagnostics(error: unknown) {
  const names = new Set([
    "Error",
    "HttpRequestError",
    "TimeoutError",
    "RpcRequestError",
    "ContractFunctionExecutionError",
    "ContractFunctionRevertedError",
    "ContractFunctionZeroDataError",
    "CallExecutionError",
    "UnknownRpcError",
    "InvalidInputRpcError",
    "InvalidParamsRpcError",
    "InternalRpcError",
    "ExecutionRevertedError",
    "BlockNotFoundError",
    "TypeError",
  ]);
  const seen = new Set<unknown>();
  const chain: {
    type: string;
    code?: number;
    status?: number;
    category: string;
  }[] = [];
  let current = error;
  while (
    current &&
    typeof current === "object" &&
    !seen.has(current) &&
    chain.length < 8
  ) {
    seen.add(current);
    const e = current as {
      name?: string;
      code?: unknown;
      status?: unknown;
      message?: string;
      cause?: unknown;
    };
    const message =
      typeof e.message === "string" ? e.message.toLowerCase() : "";
    const category = message.includes("batch of more than")
      ? "batch-limit"
      : message.includes("archive requests")
        ? "archive-policy"
        : message.includes("too many subrequests")
          ? "worker-subrequest-limit"
          : message.includes("disallowed operation called within global scope")
            ? "worker-global-scope"
            : /rate limit|too many requests/.test(message)
              ? "rate-limit"
              : /timed out|timeout/.test(message)
                ? "timeout"
                : /execution reverted/.test(message)
                  ? "reverted"
                  : /undefined|destructur|not iterable/.test(message)
                    ? "invalid-response-shape"
                    : /no usable quote/.test(message)
                      ? "no-quote"
                      : "other";
    chain.push({
      type: names.has(e.name ?? "") ? e.name! : "UnknownError",
      ...(typeof e.code === "number" && Number.isFinite(e.code)
        ? { code: e.code }
        : {}),
      ...(typeof e.status === "number" && Number.isFinite(e.status)
        ? { status: e.status }
        : {}),
      category,
    });
    current = e.cause;
  }
  return chain;
}

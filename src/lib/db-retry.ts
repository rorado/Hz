import { Prisma } from "@/generated/prisma/client";

const TRANSIENT_CODES = new Set(["ETIMEDOUT", "ECONNRESET", "ECONNREFUSED"]);

function isTransientPrismaError(error: unknown) {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError)) {
    return false;
  }

  if (TRANSIENT_CODES.has(error.code)) {
    return true;
  }

  const code =
    typeof error.meta === "object" &&
    error.meta &&
    "code" in error.meta &&
    typeof (error.meta as { code?: unknown }).code === "string"
      ? (error.meta as { code: string }).code
      : undefined;

  return !!code && TRANSIENT_CODES.has(code);
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function withDbRetry<T>(fn: () => Promise<T>, retries = 2) {
  let attempt = 0;

  while (true) {
    try {
      return await fn();
    } catch (error) {
      if (!isTransientPrismaError(error) || attempt >= retries) {
        throw error;
      }

      // Small backoff helps absorb temporary network instability.
      await sleep(200 * (attempt + 1));
      attempt += 1;
    }
  }
}

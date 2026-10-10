import { beforeEach, describe, expect, it, vi } from "vitest";
import "./setup";
import { Prisma } from "@prisma/client";
import { prismaMock } from "./prisma.mock";
import { financialTransaction } from "@/lib/services/financial-transaction";

const error = (code: string, meta?: Record<string, unknown>) => new Prisma.PrismaClientKnownRequestError("injected", { code, meta, clientVersion: "6.7.0" });
beforeEach(() => vi.resetAllMocks());
describe("Financial transaction retry policy", () => {
  it.each([error("P2034"), error("P2010", { code: "40P01" }), error("P2010", { code: "40001" })])("retries an aborted transaction only, then succeeds", async failure => {
    prismaMock.$transaction.mockRejectedValueOnce(failure).mockResolvedValueOnce("committed");
    expect(await financialTransaction(async () => "committed")).toBe("committed");
    expect(prismaMock.$transaction).toHaveBeenCalledTimes(2);
  });
  it("limits retry attempts and exposes a controlled HTTP 503", async () => {
    prismaMock.$transaction.mockRejectedValue(error("P2034"));
    await expect(financialTransaction(vi.fn())).rejects.toMatchObject({ statusCode: 503 });
    expect(prismaMock.$transaction).toHaveBeenCalledTimes(3);
  });
  it.each(["P1017", "P2028", "P1001"])("does not retry an uncertain commit (%s)", async code => {
    prismaMock.$transaction.mockRejectedValue(error(code));
    await expect(financialTransaction(vi.fn())).rejects.toMatchObject({ statusCode: 503 });
    expect(prismaMock.$transaction).toHaveBeenCalledTimes(1);
  });
  it("does not retry business or constraint errors", async () => {
    prismaMock.$transaction.mockRejectedValue(error("P2002"));
    await expect(financialTransaction(vi.fn())).rejects.toMatchObject({ code: "P2002" });
    expect(prismaMock.$transaction).toHaveBeenCalledTimes(1);
  });
});

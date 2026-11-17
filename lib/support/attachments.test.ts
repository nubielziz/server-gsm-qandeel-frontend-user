import { describe, expect, it } from "vitest";
import {
  activeChips,
  attachmentProblem,
  ATTACHMENT_ACCEPT,
  canSend,
  chipsReducer,
  formatFileSize,
  MAX_ATTACHMENT_BYTES,
  MAX_ATTACHMENTS,
  planPicks,
  uploadedIds,
  type Chip,
} from "./attachments";

const file = (name: string, type: string, size = 1000) => ({ name, type, size });
const chip = (key: number, status: Chip["status"], fileId: number | null = null): Chip => ({ key, name: `f${key}.pdf`, size: 10, status, fileId, error: status === "error" ? "bad" : null });

describe("attachmentProblem: what may be attached", () => {
  it("accepts PDF, JPEG and PNG up to 5 MiB", () => {
    expect(attachmentProblem(file("a.pdf", "application/pdf"))).toBeNull();
    expect(attachmentProblem(file("a.jpg", "image/jpeg"))).toBeNull();
    expect(attachmentProblem(file("a.png", "image/png", MAX_ATTACHMENT_BYTES))).toBeNull();
  });

  it("refuses another type by its type, and judges a file with no type by its extension", () => {
    expect(attachmentProblem(file("a.exe", "application/x-msdownload"))).toBe("type");
    expect(attachmentProblem(file("a.gif", "image/gif"))).toBe("type");
    expect(attachmentProblem(file("a.PDF", ""))).toBeNull();
    expect(attachmentProblem(file("a.jpeg", ""))).toBeNull();
    expect(attachmentProblem(file("a.exe", ""))).toBe("type");
  });

  it("refuses an empty file and one over 5 MiB, naming the type first", () => {
    expect(attachmentProblem(file("a.pdf", "application/pdf", 0))).toBe("empty");
    expect(attachmentProblem(file("a.pdf", "application/pdf", MAX_ATTACHMENT_BYTES + 1))).toBe("too_large");
    expect(attachmentProblem(file("a.exe", "application/x-msdownload", MAX_ATTACHMENT_BYTES + 1))).toBe("type");
  });

  it("accepts by type and by extension in the file input", () => {
    expect(ATTACHMENT_ACCEPT).toBe("application/pdf,image/jpeg,image/png,.pdf,.jpg,.jpeg,.png");
  });
});

describe("formatFileSize", () => {
  it("writes bytes, kB and MB", () => {
    expect(formatFileSize(512, "en")).toMatch(/512/);
    expect(formatFileSize(340 * 1024, "en")).toMatch(/340\s?kB/i);
    expect(formatFileSize(1.5 * 1024 * 1024, "en")).toMatch(/1\.5/);
    expect(formatFileSize(2 * 1024 * 1024, "en")).toMatch(/2/);
  });
});

describe("chips: the files in the box under the reply", () => {
  it("adds, finishes, fails and removes chips by key", () => {
    let chips: Chip[] = [];
    chips = chipsReducer(chips, { type: "add", chips: [chip(1, "uploading"), chip(2, "uploading")] });
    chips = chipsReducer(chips, { type: "done", key: 1, fileId: 55 });
    chips = chipsReducer(chips, { type: "fail", key: 2, error: "too big" });
    expect(chips[0]).toMatchObject({ status: "done", fileId: 55, error: null });
    expect(chips[1]).toMatchObject({ status: "error", fileId: null, error: "too big" });
    expect(chipsReducer(chips, { type: "remove", key: 2 }).map((c) => c.key)).toEqual([1]);
    expect(chipsReducer(chips, { type: "clear" })).toEqual([]);
  });

  it("counts the files against the limit of five unless refused, and lists the uploaded ids in pick order", () => {
    const chips = [chip(1, "done", 10), chip(2, "uploading"), chip(3, "error"), chip(4, "done", 11)];
    expect(activeChips(chips)).toBe(3);
    expect(uploadedIds(chips)).toEqual([10, 11]);
  });
});

describe("planPicks: what to do with files just picked", () => {
  it("uploads the good ones and refuses the others with their reason", () => {
    const plan = planPicks(0, [file("a.pdf", "application/pdf"), file("b.exe", "application/x-msdownload"), file("c.png", "image/png", 0)]);
    expect(plan.accepted).toEqual([0]);
    expect(plan.rejected).toEqual([
      { index: 1, problem: "type" },
      { index: 2, problem: "empty" },
    ]);
    expect(plan.overflow).toBe(false);
  });

  it("stops at five files in all and says so", () => {
    const picks = Array.from({ length: 4 }, (_, i) => file(`f${i}.pdf`, "application/pdf"));
    const plan = planPicks(3, picks);
    expect(plan.accepted).toEqual([0, 1]);
    expect(plan.overflow).toBe(true);
    expect(3 + plan.accepted.length).toBe(MAX_ATTACHMENTS);
  });
});

describe("canSend: text or a file, and no upload still running", () => {
  it("allows text alone, files alone, and neither only when empty", () => {
    expect(canSend("hello", [])).toEqual({ ok: true, waiting: false });
    expect(canSend("   ", [chip(1, "done", 3)])).toEqual({ ok: true, waiting: false });
    expect(canSend("   ", [])).toEqual({ ok: false, waiting: false });
    expect(canSend("", [chip(1, "error")])).toEqual({ ok: false, waiting: false });
  });

  it("waits while a file is uploading", () => {
    expect(canSend("hello", [chip(1, "uploading")])).toEqual({ ok: false, waiting: true });
  });
});

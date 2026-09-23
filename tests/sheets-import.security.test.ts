import { describe, expect, it } from "vitest";
import {
  parseBindingInput,
  parseImportInput,
} from "../server/sheets-service.js";

describe("Phase 8 Sheets binding validation", () => {
  it("accepts a Google spreadsheet identifier and tab name", () => {
    expect(
      parseBindingInput({
        googleConnectionId: "7",
        spreadsheetId: "abc_123-Z",
        tabName: "Leads",
      }),
    ).toEqual({
      googleConnectionId: 7,
      spreadsheetId: "abc_123-Z",
      tabName: "Leads",
    });
  });
  it("rejects arbitrary spreadsheet URLs and empty tabs", () => {
    expect(() =>
      parseBindingInput({
        googleConnectionId: 7,
        spreadsheetId: "https://evil.example",
        tabName: "Leads",
      }),
    ).toThrow();
    expect(() =>
      parseBindingInput({
        googleConnectionId: 7,
        spreadsheetId: "abc123",
        tabName: "",
      }),
    ).toThrow();
  });
  it("requires a positive owned binding identifier for import", () => {
    expect(parseImportInput({ bindingId: "12" })).toEqual({ bindingId: 12 });
    expect(() => parseImportInput({ bindingId: 0 })).toThrow();
  });
});

import { describe, expect, it } from "vitest";
import { COMPANY_PARAM, parseCompanySlugParam, signupHref } from "./company-param";

describe("parseCompanySlugParam", () => {
  it("returns a valid kebab-case slug unchanged", () => {
    expect(parseCompanySlugParam("and-vision-agency")).toBe("and-vision-agency");
  });

  it("trims and lowercases the value", () => {
    expect(parseCompanySlugParam("  AND-Vision-Agency ")).toBe("and-vision-agency");
  });

  it("uses the first value when the param is repeated", () => {
    expect(parseCompanySlugParam(["sonatel", "orange"])).toBe("sonatel");
  });

  it("returns null when the param is missing or empty", () => {
    expect(parseCompanySlugParam(undefined)).toBeNull();
    expect(parseCompanySlugParam("")).toBeNull();
    expect(parseCompanySlugParam("   ")).toBeNull();
    expect(parseCompanySlugParam([])).toBeNull();
  });

  it("rejects values that are not slugs", () => {
    expect(parseCompanySlugParam("../etc/passwd")).toBeNull();
    expect(parseCompanySlugParam("<script>")).toBeNull();
    expect(parseCompanySlugParam("hôtel la teranga")).toBeNull();
    expect(parseCompanySlugParam("-leading")).toBeNull();
    expect(parseCompanySlugParam("double--dash")).toBeNull();
  });

  it("rejects overly long values", () => {
    expect(parseCompanySlugParam("a".repeat(121))).toBeNull();
    expect(parseCompanySlugParam("a".repeat(120))).toBe("a".repeat(120));
  });
});

describe("signupHref", () => {
  it("links to the sign-up page without a company", () => {
    expect(signupHref()).toBe("/inscription");
  });

  it("adds the encoded company slug", () => {
    expect(signupHref("and-vision-agency")).toBe(`/inscription?${COMPANY_PARAM}=and-vision-agency`);
  });
});

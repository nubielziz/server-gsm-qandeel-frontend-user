import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Button, buttonClasses, type ButtonVariant } from "./button";

const VARIANTS: ButtonVariant[] = ["primary", "secondary", "ghost", "inverse", "danger", "link"];
const classesOf = (variant: ButtonVariant) => buttonClasses({ variant }).split(" ");

describe("Button motion (globals.css, Button motion)", () => {
  it("gives every variant the eased colours and the press, and no colour transition utility that would override them", () => {
    for (const variant of VARIANTS) {
      expect(classesOf(variant), variant).toContain("btn-motion");
      expect(classesOf(variant).some((c) => c.startsWith("transition")), variant).toBe(false);
    }
  });

  it("lifts the primary with a shadow and the secondary with a lighter one; the others only change colour", () => {
    expect(classesOf("primary")).toContain("btn-lift");
    expect(classesOf("secondary")).toContain("btn-lift-soft");
    expect(classesOf("secondary")).toContain("hover:border-ink");
    for (const variant of ["ghost", "inverse", "danger", "link"] as const) {
      expect(classesOf(variant).filter((c) => c.startsWith("btn-lift")), variant).toEqual([]);
    }
  });

  it("wraps the end icon (it leans on hover), not the start icon", () => {
    const html = renderToStaticMarkup(
      <Button startIcon={<i data-icon="start" />} endIcon={<i data-icon="end" />}>
        Next
      </Button>,
    );
    expect(html).toContain('<span class="btn-end-icon"><i data-icon="end"></i></span>');
    expect(html).not.toMatch(/btn-end-icon"><i data-icon="start"/);
    expect(html.indexOf('data-icon="start"')).toBeLessThan(html.indexOf("Next"));
    expect(html.indexOf("Next")).toBeLessThan(html.indexOf("btn-end-icon"));
  });

  it("adds no wrapper without an end icon", () => {
    expect(renderToStaticMarkup(<Button>Save</Button>)).not.toContain("btn-end-icon");
  });

  it("marks a loading button busy and disabled, which the motion rules exclude", () => {
    const html = renderToStaticMarkup(<Button loading>Save</Button>);
    expect(html).toContain('aria-busy="true"');
    expect(html).toContain("disabled");
  });
});

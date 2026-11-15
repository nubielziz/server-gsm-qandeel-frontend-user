import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Table, TableBody, TableCell, TableHead, TableHeaderCell, TableRow } from "./table";

function list(props: { compact?: boolean; stacked?: boolean }) {
  return renderToStaticMarkup(
    <Table caption="Orders" {...props}>
      <TableHead>
        <TableRow>
          <TableHeaderCell>Order</TableHeaderCell>
          <TableHeaderCell>Quantity</TableHeaderCell>
        </TableRow>
      </TableHead>
      <TableBody>
        <TableRow>
          <TableCell phone="title">#1</TableCell>
          <TableCell phone="hide" label="Quantity">
            1
          </TableCell>
        </TableRow>
      </TableBody>
    </Table>,
  );
}

describe("Table compact (plan P1.1: one markup for every screen)", () => {
  it("is a stacked table with the phone row rules on the table, and keeps every ARIA role the stacked table has", () => {
    const html = list({ compact: true });
    expect(html).toContain("table-stacked");
    expect(html).toContain("max-md:[&amp;_tbody_tr]:flex"); // `&` is escaped in the markup
    for (const role of ["table", "rowgroup", "row", "columnheader", "cell"]) expect(html).toContain(`role="${role}"`);
    expect(html).toContain('<caption class="sr-only">Orders</caption>');
  });

  it("stays a keyboard-reachable named region (it is a real, possibly scrolling table from md up)", () => {
    const html = list({ compact: true });
    expect(html).toMatch(/<div[^>]*tabindex="0"[^>]*role="region"[^>]*aria-label="Orders"|<div[^>]*role="region"[^>]*aria-label="Orders"[^>]*tabindex="0"/);
    // A plain stacked table is cards where it would scroll: no scroll box to reach.
    expect(list({ stacked: true })).not.toContain("tabindex");
  });

  it("gives a cell the classes of its phone slot and keeps the normal cell padding from md up", () => {
    const html = list({ compact: true });
    expect(html).toContain("max-md:order-1");
    expect(html).toContain("max-md:hidden");
    expect(html).toContain("md:px-4");
    // A cell without a slot keeps the plain padding on every screen.
    const plain = renderToStaticMarkup(<TableCell>x</TableCell>);
    expect(plain).toContain("px-4 py-3.5");
    expect(plain).not.toContain("max-md:");
  });

  it("only compact tables carry the row rules", () => {
    expect(list({ stacked: true })).not.toContain("_tbody_tr");
    expect(list({})).not.toContain("table-stacked");
  });
});

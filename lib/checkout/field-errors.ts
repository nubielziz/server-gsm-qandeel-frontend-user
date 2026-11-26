// Where the field errors of a refused checkout go (decision 007). Pure, so the rule is unit-tested: an error on a path the details
// form draws a box for lands under that box; an error on any other path (`imei` of an older API, `body`, an input the service no
// longer lists) has no place to show, so it becomes the message of the whole form: it is never lost.
import type { FieldError } from "@/lib/api/errors";

/**
 * The paths of the field errors the details form draws a box for.
 *
 * @param shape `fieldKeys`: the keys of the custom fields it lists (each is `inputs.<key>`, a field of type `imei` included); `region`: the
 *   region box is shown (the country has regional tax); `quantity`: the drawer, which holds the quantity, is offered.
 * @returns `email`, `country` and `currency` always, plus what `shape` says
 */
export function drawnPaths(shape: { fieldKeys: readonly string[]; region: boolean; quantity: boolean }): Set<string> {
  return new Set([
    "email",
    "country",
    "currency",
    ...(shape.region ? ["region"] : []),
    ...shape.fieldKeys.map((key) => `inputs.${key}`),
    ...(shape.quantity ? ["quantity"] : []),
  ]);
}

/** The field errors of a 422, sorted by where they can be shown. */
export type PlacedErrors = {
  /** The text of the first error on each drawn path, by path. */
  fields: Record<string, string>;
  /** The text of an error on `serviceId`: the service cannot be ordered (it wins over `unplaced`). */
  service?: string;
  /** The text of the first error on a path with no box. */
  unplaced?: string;
};

/**
 * Sorts the field errors of a 422 by where they can be shown.
 *
 * @param errors the `errors[]` of the problem
 * @param drawn the paths the form draws a box for (`drawnPaths`)
 * @param text turns one error into the words shown for it
 */
export function placeFieldErrors(errors: readonly FieldError[], drawn: ReadonlySet<string>, text: (error: FieldError) => string): PlacedErrors {
  const placed: PlacedErrors = { fields: {} };
  for (const error of errors) {
    const message = text(error);
    if (error.field === "serviceId") placed.service ??= message;
    else if (drawn.has(error.field)) placed.fields[error.field] ??= message;
    else placed.unplaced ??= message;
  }
  return placed;
}

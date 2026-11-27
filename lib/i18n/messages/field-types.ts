// What the two order forms say about the checked field types (decisions 008 and 009): the line under the box that tells what to type,
// and the live count of a list of IMEIs. Shared by the shop's checkout drawer (checkout.start.drawer.types) and the merchant order form
// (merchant.form.types), so the sentence is the same on both. The sentences of a refusal are the API's, by code (./errors.ts).

export const fieldTypes = {
  hints: {
    imei_bulk: "One IMEI per line, up to 30.",
    imeisv: "16 digits. Spaces and dashes are removed.",
    serial: "5 to 30 letters and digits. Spaces are removed.",
    iccid: "18 to 22 digits, starting with 89. Spaces and dashes are removed.",
    eid: "32 digits. Spaces and dashes are removed.",
    meid: "14 hexadecimal characters (0-9, A-F), or 18 digits.",
    ecid: "8 to 16 hexadecimal characters (0x first is fine), or up to 20 digits.",
    mac_address: "12 hexadecimal characters, like AA:BB:CC:DD:EE:FF.",
    mi_lock_code: "6 to 64 letters, digits and dashes.",
    box_sn: "4 to 32 letters, digits and dashes. Spaces are removed.",
  },
  /** The live count under a list: "3 IMEIs". */
  count: { one: "{count} IMEI", other: "{count} IMEIs" },
};

export type FieldTypeMessages = typeof fieldTypes;

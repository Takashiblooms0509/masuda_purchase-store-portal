/** Customer business labels, shared by direct entry and CSV. */
export const IDENTIFICATION_TYPES = [
  "運転免許証",
  "マイナンバーカード",
  "パスポート",
  "その他",
] as const;

export function isMyNumberType(value: string | null | undefined): boolean {
  // Recognize the existing document enum too; never render a legacy number
  // simply because a stored type used the technical spelling.
  return value === "マイナンバーカード" || value === "my_number_card";
}

export function identificationNumberAllowed(
  type: string | null | undefined,
  number: string | null | undefined,
): boolean {
  return !isMyNumberType(type) || !number?.trim();
}

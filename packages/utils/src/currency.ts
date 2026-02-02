/**
 * Currency formatting utilities
 * All currency values should be displayed in Mongolian Tugrik (MNT / ₮)
 */

/**
 * Format a number as Mongolian Tugrik (MNT)
 * Uses Mongolian locale with currency formatting
 * 
 * @param value - The numeric value to format
 * @returns Formatted string with ₮ symbol (e.g., "₮ 10,000")
 */
export function formatMNT(value: number): string {
  if (typeof value !== "number" || isNaN(value)) {
    return "₮ 0";
  }

  // Use Intl.NumberFormat with Mongolian locale
  // maximumFractionDigits: 0 means no decimal places (MNT doesn't use decimals)
  const formatter = new Intl.NumberFormat("mn-MN", {
    style: "currency",
    currency: "MNT",
    maximumFractionDigits: 0,
    minimumFractionDigits: 0,
  });

  return formatter.format(value);
}

/**
 * Format a number as Mongolian Tugrik without currency symbol
 * Useful when you want to display the symbol separately
 * 
 * @param value - The numeric value to format
 * @returns Formatted number string (e.g., "10,000")
 */
export function formatMNTNumber(value: number): string {
  if (typeof value !== "number" || isNaN(value)) {
    return "0";
  }

  const formatter = new Intl.NumberFormat("mn-MN", {
    maximumFractionDigits: 0,
    minimumFractionDigits: 0,
  });

  return formatter.format(value);
}

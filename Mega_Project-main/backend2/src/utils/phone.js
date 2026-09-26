/**
 * Normalize an Indian phone number string into standard E.164 format (+91XXXXXXXXXX).
 * Handles formats like: "9876543210", "09876543210", "+91 98765-43210", etc.
 * @param {string} phone - Raw input phone string
 * @returns {string} Normalized E.164 phone string
 */
const normalizePhone = (phone) => {
  if (!phone || typeof phone !== "string") return "";

  // Strip all whitespace, hyphens, parentheses, and non-digit characters except leading '+'
  let cleaned = phone.trim().replace(/[\s\-\(\)]/g, "");

  // If starts with +91, remove +91 prefix to standardize digit check
  if (cleaned.startsWith("+91")) {
    cleaned = cleaned.slice(3);
  } else if (cleaned.startsWith("91") && cleaned.length === 12) {
    cleaned = cleaned.slice(2);
  } else if (cleaned.startsWith("0") && cleaned.length === 11) {
    cleaned = cleaned.slice(1);
  }

  // Ensure cleaned digits equal 10 and start with valid Indian mobile digit (6-9)
  if (/^[6-9]\d{9}$/.test(cleaned)) {
    return `+91${cleaned}`;
  }

  return phone.trim();
};

/**
 * Validate whether a phone string is a valid Indian mobile number.
 * @param {string} phone - Input phone number
 * @returns {boolean} True if valid, false otherwise
 */
const isValidPhone = (phone) => {
  const normalized = normalizePhone(phone);
  return /^\+91[6-9]\d{9}$/.test(normalized);
};

export { normalizePhone, isValidPhone };

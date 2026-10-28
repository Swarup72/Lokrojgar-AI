// Client-side mirrors of backend2's real validation rules (auth.validator.js,
// user.model.js) - checked here only to give fast, friendly feedback before
// a request is sent; the backend remains the source of truth.

const PHONE_REGEX = /^(?:\+91)?[6-9]\d{9}$/;

export function isValidPhone(phone) {
  if (typeof phone !== "string") return false;
  const clean = phone.trim().replace(/[\s-]/g, "");
  return PHONE_REGEX.test(clean);
}

export function isValidPassword(password) {
  return typeof password === "string" && password.length >= 6;
}

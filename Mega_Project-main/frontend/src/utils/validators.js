// Client-side mirrors of backend2's real validation rules (auth.validator.js,
// user.model.js) - checked here only to give fast, friendly feedback before
// a request is sent; the backend remains the source of truth.

const PHONE_REGEX = /^(?:\+91)?[6-9]\d{9}$/;

export function isValidPhone(phone) {
  return typeof phone === "string" && PHONE_REGEX.test(phone.trim());
}

export function isValidPassword(password) {
  return typeof password === "string" && password.length >= 6;
}

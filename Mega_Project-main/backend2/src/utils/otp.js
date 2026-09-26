import bcrypt from "bcrypt";

/**
 * Generate a random numeric OTP of specified length (default: 6 digits).
 * @param {number} length - Length of OTP (default: 6)
 * @returns {string} OTP string
 */
const generateOTP = (length = 6) => {
  const digits = "0123456789";
  let otp = "";
  for (let i = 0; i < length; i++) {
    otp += digits[Math.floor(Math.random() * 10)];
  }
  return otp;
};

/**
 * Hash plaintext OTP using bcrypt.
 * @param {string} otp - Plaintext OTP
 * @returns {Promise<string>} Hashed OTP string
 */
const hashOTP = async (otp) => {
  const salt = await bcrypt.genSalt(10);
  return await bcrypt.hash(otp, salt);
};

/**
 * Compare candidate OTP against stored hash.
 * @param {string} candidateOTP - Plaintext candidate OTP
 * @param {string} hashedOTP - Hashed OTP string
 * @returns {Promise<boolean>} True if match, false otherwise
 */
const verifyOTP = async (candidateOTP, hashedOTP) => {
  if (!candidateOTP || !hashedOTP) return false;
  return await bcrypt.compare(candidateOTP, hashedOTP);
};

export { generateOTP, hashOTP, verifyOTP };

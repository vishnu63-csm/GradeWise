const ALLOWED_DEPARTMENTS = [
  "CSM",
  "CSE",
  "CSD",
  "CSO",
  "IT",
  "ECE",
  "EEE",
  "MECH",
  "CIVIL",
  "AI&ML",
  "AI&DS",
];

const BLACKLISTED_NAMES = [
  "test user",
  "demo user",
  "dummy user",
  "lat user",
  "regular user",
  "reg user",
  "dec user",
];

const BLACKLISTED_PHONES = [
  "1234567890",
  "0000000000",
  "1234567891",
];

/**
 * Validates a student's full name.
 * Allowed: Alphabetic characters, dots (e.g. initials like K. Leela), and spaces.
 * Length: 3 to 50 characters.
 * Rejects explicit dummy account names.
 */
function validateName(name) {
  if (!name || typeof name !== "string") {
    return { valid: false, message: "Name is required." };
  }
  const trimmed = name.trim();
  if (trimmed.length < 3) {
    return { valid: false, message: "Name must be at least 3 characters long." };
  }
  if (trimmed.length > 50) {
    return { valid: false, message: "Name cannot exceed 50 characters." };
  }
  // Allow letters, spaces, and periods (common for Indian names with initials)
  if (!/^[A-Za-z.\s]+$/.test(trimmed)) {
    return { valid: false, message: "Name must contain only letters and spaces." };
  }
  
  const lower = trimmed.toLowerCase();
  if (BLACKLISTED_NAMES.includes(lower)) {
    return { valid: false, message: `"${trimmed}" is a blacklisted test/dummy name.` };
  }

  return { valid: true, value: trimmed };
}

/**
 * Validates JNTUK Roll Number format based on Category.
 * Regular Entry: 10 chars, 5th-6th char must be "1A" (e.g., 23HP1A4263).
 * Lateral Entry: 10 chars, 5th-6th char must be "5A" (e.g., 24HP5A4202).
 */
function validateRollNumber(rollNumber, category) {
  if (!rollNumber || typeof rollNumber !== "string") {
    return { valid: false, message: "Roll number is required." };
  }
  const normalized = rollNumber.trim().toUpperCase();
  if (normalized.length !== 10) {
    return { valid: false, message: "Roll number must be exactly 10 characters long." };
  }

  if (category === "Regular Entry") {
    const regPattern = /^\d{2}[A-Z0-9]{2}1A[A-Z0-9]{4}$/;
    if (!regPattern.test(normalized)) {
      return {
        valid: false,
        message: "Invalid Roll Number format for Regular Entry. Expected format: 23HP1A4263 (5th & 6th characters must be '1A').",
      };
    }
  } else if (category === "Lateral Entry") {
    const latPattern = /^\d{2}[A-Z0-9]{2}5A[A-Z0-9]{4}$/;
    if (!latPattern.test(normalized)) {
      return {
        valid: false,
        message: "Invalid Roll Number format for Lateral Entry. Expected format: 24HP5A4202 (5th & 6th characters must be '5A').",
      };
    }
  } else {
    return { valid: false, message: "Invalid Student Category." };
  }

  return { valid: true, value: normalized };
}

/**
 * Validates Department against fixed allowed list.
 */
function validateDepartment(dept) {
  if (!dept || typeof dept !== "string") {
    return { valid: false, message: "Department is required." };
  }
  const trimmed = dept.trim().toUpperCase();
  if (!ALLOWED_DEPARTMENTS.includes(trimmed)) {
    return {
      valid: false,
      message: `Invalid department. Allowed departments: ${ALLOWED_DEPARTMENTS.join(", ")}.`,
    };
  }
  return { valid: true, value: trimmed };
}

/**
 * Validates Indian Mobile Number (10 digits starting with 6, 7, 8, or 9).
 * Rejects dummy numbers (all repeated digits, blacklisted sequences).
 */
function validatePhone(phone) {
  if (!phone || typeof phone !== "string") {
    return { valid: false, message: "Phone number is required." };
  }
  const trimmed = phone.trim();
  if (!/^[6-9]\d{9}$/.test(trimmed)) {
    return {
      valid: false,
      message: "Phone number must be a valid 10-digit Indian mobile number starting with 6, 7, 8, or 9.",
    };
  }
  // Check for all identical digits (e.g. 5555555555, 9999999999)
  if (/^(\d)\1{9}$/.test(trimmed)) {
    return { valid: false, message: "Invalid phone number: Repeated digits are not allowed." };
  }
  if (BLACKLISTED_PHONES.includes(trimmed)) {
    return { valid: false, message: "Invalid phone number: Dummy test numbers are not allowed." };
  }

  return { valid: true, value: trimmed };
}

/**
 * Validates Student Category.
 */
function validateCategory(category) {
  if (!category || (category !== "Regular Entry" && category !== "Lateral Entry")) {
    return {
      valid: false,
      message: "Category must be either 'Regular Entry' or 'Lateral Entry'.",
    };
  }
  return { valid: true, value: category };
}

module.exports = {
  ALLOWED_DEPARTMENTS,
  validateName,
  validateRollNumber,
  validateDepartment,
  validatePhone,
  validateCategory,
};

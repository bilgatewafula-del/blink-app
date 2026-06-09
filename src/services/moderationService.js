const bannedWords = [
  "free money",
  "double your money",
  "guaranteed profit",
  "send me money",
  "bitcoin hack",
];

export const checkMessage = (text) => {
  const lower = text.toLowerCase();

  for (let word of bannedWords) {
    if (lower.includes(word)) {
      return {
        safe: false,
        message:
          "⚠️ Your message looks unsafe. Please avoid scams or spam content.",
      };
    }
  }

  return { safe: true };
};
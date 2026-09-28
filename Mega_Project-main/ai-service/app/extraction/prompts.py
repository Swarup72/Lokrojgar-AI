EXTRACTION_SYSTEM_PROMPT = """You are extracting structured worker-profile information from a voice transcript for a blue-collar job platform in India. The transcript may be in Marathi, Hindi, English, or a mix of these languages (code-mixed).

Extract ONLY information the speaker explicitly stated. Do not guess, estimate, or infer any value the speaker did not say - if a field was not mentioned, its value must be null.

Field rules:
- fullName: the speaker's name, exactly as stated (preserve the original spelling/transliteration).
- experienceYears: a plain number of years, only if a duration was explicitly stated (e.g. "five years", "पाच वर्षे", "5 saal"). Convert number-words to digits.
- expectedPay: a plain number, only if a specific pay amount was explicitly stated. Never estimate typical pay for a trade.
- skills: an array of concise skill names, only skills explicitly mentioned (e.g. "plumbing", "electrical wiring").
- city: only if a specific city/town/village name was stated.
- bio: a short, neutral 1-2 sentence summary based only on what was said.
- availability: exactly one of "available", "busy", or "unavailable", only if the speaker described their current availability in those terms.
- languages: the languages the speaker says THEY speak (not the transcript's own language), from ["mr","hi","en"], only if explicitly mentioned.
- preferredJobCategories: concise job-category names the speaker expressed interest in, only if explicitly mentioned.

Respond only with the structured JSON."""

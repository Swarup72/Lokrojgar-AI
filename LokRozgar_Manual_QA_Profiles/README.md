# LokRozgar AI Manual QA Profiles

Synthetic data only; no tests were run and no application records were created.

- `workers.json/.csv`: 40 worker profiles (Marathi, English, mixed language; skills, experience, location, pay, availability, ratings).
- `employers.json/.csv`: 15 employers (verification/account statuses, normal and high-volume patterns).
- `jobs.json/.csv`: 50 jobs including Marathi/English equivalents, duplicates, legitimate similar vacancies, different pay types and suspicious examples.
- `applications.json/.csv`: 10 application relationship examples.
- `matching_pairs.json/.csv`: 42 worker/job combinations with qualitative expectations, not invented scores.
- `fraud_scenarios.json/.csv`: 12 manual fraud and false-positive scenarios.
- `reports.json/.csv`: 8 example reports, including repeated and independent reports.
- `negative_test_cases.json/.csv`: 15 invalid-input examples; do not treat these as valid profiles.

IMPORTANT:
1. Review actual Mongoose schemas and supported enum values before manually entering records.
2. Contact values are fictional examples; do not send messages to them.
3. Pay units and application statuses must be checked against your current app.
4. Fraud scenarios are for review, not proof that any entity is fraudulent.
5. Use a local/test environment only; do not import into production.

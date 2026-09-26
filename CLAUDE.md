# LokRozgar AI

## Project Goal

LokRozgar AI is a multilingual employment platform designed to connect
blue-collar workers with local employers.

This repository contains the AI/ML service and AI-related processing.

## Developer Responsibility

The developer is responsible for Modules 2, 3, 4 and 5.

### Module 2 — Voice-Based Profile Creation

Responsibilities:

- audio processing
- speech-to-text
- Marathi support
- Hindi support
- English support
- language detection
- transcription processing
- multilingual NLP
- worker information extraction
- structured worker profile creation

### Module 3 — Job Posting and Management

AI responsibilities:

- job description processing
- skill extraction
- requirement extraction
- job normalization
- structured job representation

### Module 4 — Intelligent Job Recommendation

Responsibilities:

- skill compatibility
- experience compatibility
- location proximity
- availability compatibility
- job/profile relevance
- wage compatibility
- worker rating
- job type compatibility
- semantic matching
- match scoring
- ranking
- recommendations
- recommendation explanations

### Module 5 — Reviews and Ratings

Responsibilities:

- rating processing
- review processing
- worker reputation
- trust-related features
- optional review sentiment analysis
- using rating/reputation signals in future matching

## Development Philosophy

The developer is learning the system while building it.

The developer will write the implementation manually.

Claude Code should act as:

- mentor
- researcher
- architecture advisor
- debugging assistant
- code reviewer

Do NOT generate the entire application automatically.

Before implementing a feature:

1. Explain the problem.
2. Explain the required concepts.
3. Explain the proposed solution.
4. Explain the inputs and outputs.
5. Explain important edge cases.
6. Then provide implementation guidance.

Prefer simple and explainable solutions before complex ML.

Do not introduce deep learning unless it provides a clear benefit.

Do not hide important logic behind unexplained abstractions.

Every AI component should be independently testable.

## Development Stages

1. Foundation
2. Data modeling
3. Voice processing
4. Multilingual processing
5. Information extraction
6. Job processing
7. Skill normalization
8. Matching
9. Semantic matching
10. Ranking
11. Recommendation
12. Reviews and reputation
13. FastAPI
14. Integration
15. Evaluation
16. Deployment

## Important Rule

Never assume that a design choice is fixed simply because it appears
in the project synopsis.

Clearly distinguish:

- project requirements
- implementation decisions
- experimental choices
- assumptions
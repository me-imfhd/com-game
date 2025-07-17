# Enhanced MVP Plan

## Core Goal

Build a personalized bot that can:

1. Analyze a user's Farcaster presence deeply
2. Understand their interaction patterns
3. Generate contextual responses in their style

## Technical Stack

- Express + Bun + TypeScript
- Jest for testing
- Error handling using Result/Either pattern (neverthrow)
- In-memory storage (no DB for MVP)
- LLM integration (via provided class)
- Neynar SDK integration

## MVP Components

### 1. Data Collection & Processing (30 mins)

- Use NeynarClient for data fetching:
  - `neynarDataHubQueryResult` for bulk data
  - Error handling using neverthrow Result type
- Process NeynarDataHub.Row[] into UserDataStore format
- Use LLM wherever neccesary
- Handle chunked processing if needed

### 2. Analysis Engine (45 mins)

- Create AnalysisService class:

  ```typescript
  class AnalysisService {
    constructor(private neynarClient: NeynarClient) {}

    async analyzeUser(fid: number): Promise<Result<UserDataStore, Error>> {
      // Implementation
    }

    private async processRows(
      rows: NeynarDataHub.Row[]
    ): Promise<Result<UserDataStore, Error>> {
      // Implementation
    }

    private analyzeQuotePatterns(
      quotes: QuoteCast[]
    ): Map<string, QuotePattern> {
      // Analyze how users quote others, including text addition patterns
    }
  }
  ```

- Implement analysis functions using Result type for error handling
- Track analysis status and timestamps

### 3. Generation Engine (45 mins)

- Create GenerationService class:
  ```typescript
  class GenerationService {
    async generate(
      type: "cast" | "reply" | "quote",
      store: UserDataStore,
      query: string
    ): Promise<Result<string, Error>> {
      // For quotes, consider:
      // - Whether to add own text based on user's quoteTextFrequency
      // - What tone to use based on relationship with quoted author
    }
  }
  ```
- Implement generation with proper error handling
- Use analyzed data for context

### 4. API Layer (30 mins)

- POST /api/analyze/:fid
  - If not registered:
    - Sets status to ANALYZING
    - Records analysisStartedAt
    - Starts background analysis
    - Returns {fid, status: "ANALYZING", startedAt: timestamp}
  - If registered:
    - Returns current status and data if ANALYZED
    - Returns current status if ANALYZING
    - If FAILED, removes registration and starts new analysis
- POST /api/generate/:type
  - Types: cast|reply|quote
  - Returns:
    - If not analyzed: {analysisStatus, query, generatedContent: null}
    - If analyzed: {analysisStatus: "ANALYZED", query, generatedContent: string}

### 5. In-Memory Storage

- Simple Map for storing UserDataStore
- Key: fid
- Handles:
  - Registration of analysis
  - Status updates
  - Completion/failure states
  - Data cleanup on failure

### 6. Background Processing

- Runs analysis in background using AnalysisService
- Updates status on completion/failure
- Sets analysisCompletedAt on success
- Cleans up on failure for retry

## Error Handling

Using existing error types and neverthrow:

- NeynarDataHubError for data fetching
- AppError for application logic
- Result<T, E> for all async operations

## Testing Strategy

- skip

## Next Steps (Post-MVP)

- skip

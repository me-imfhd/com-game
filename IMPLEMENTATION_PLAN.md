# MVP Implementation Plan

## 1. Basic Types (5 mins)

```typescript
interface UserStyle {
  recentCasts: string[];
  commonPhrases: string[];
  emojiPattern: string[];
  topics: string[];
}

interface GenerateRequest {
  fid: string;
  prompt: string;
}
```

## 2. Project Structure (5 mins)

```
src/
  ├── index.ts        # Main server + endpoints
  ├── analyzer.ts     # Style analysis functions
  └── generator.ts    # OpenAI response generation
```

## 3. Core Components

### Style Analyzer (15 mins)

```typescript
class StyleAnalyzer {
  extractStyle(casts: string[]): UserStyle {
    return {
      recentCasts: casts,
      commonPhrases: this.findCommonPhrases(casts),
      emojiPattern: this.findEmojis(casts),
      topics: this.findTopics(casts),
    };
  }
}
```

### Response Generator (15 mins)

```typescript
class ResponseGenerator {
  async generate(style: UserStyle, prompt: string): Promise<string> {
    return openai.chat.completions.create({
      messages: [
        {
          role: "system",
          content: `Mimic style: ${JSON.stringify(style)}`,
        },
        { role: "user", content: prompt },
      ],
    });
  }
}
```

## 4. API Endpoints (20 mins)

### Analyze User

```typescript
POST /api/analyze-user/:fid
Response: {
  success: boolean;
  style?: UserStyle;
  error?: string;
}
```

### Generate Response

```typescript
POST /api/generate-response
Body: {
  fid: string;
  prompt: string;
}
Response: {
  success: boolean;
  response?: string;
  error?: string;
}
```

## Dependencies

- express
- @types/express
- openai
- dotenv

## Quick Start

```bash
# Install dependencies
bun add express @types/express openai dotenv

# Create .env file
echo "OPENAI_API_KEY=your_key_here" > .env

# Start server
bun run src/index.ts
```

## Test Endpoints

```bash
# Test analyze endpoint
curl -X POST http://localhost:3000/api/analyze-user/123

# Test generate endpoint
curl -X POST http://localhost:3000/api/generate-response \
  -H "Content-Type: application/json" \
  -d '{"fid":"123","prompt":"What do you think about AI?"}'
```

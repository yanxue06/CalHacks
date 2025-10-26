# Database Setup (Prisma + Postgres)

1. Install deps:
```
npm i @prisma/client && npm i -D prisma
```

2. Create `.env` with:
```
DATABASE_URL="postgresql://USER:PASS@localhost:5432/calhacks?schema=public"
```

3. Run:
```
npx prisma init
npx prisma generate
npx prisma migrate dev -n init_transcripts
```

# CalHacks Backend with Gemini AI

A TypeScript Express backend with Gemini AI integration via OpenRouter.

## Features

- 🤖 **Gemini AI Integration** - Powered by OpenRouter API
- 🔧 **TypeScript** - Full type safety and modern development experience
- 🚀 **Express.js** - Fast and lightweight web framework
- 🛡️ **Security** - Helmet for security headers
- 📝 **Logging** - Morgan for request logging
- 🌐 **CORS** - Cross-origin resource sharing enabled

## Setup

### 1. Install Dependencies

```bash
npm install
```

### 2. Environment Configuration

Copy the example environment file and add your OpenRouter API key:

```bash
cp env.example .env
```

Edit `.env` and add your OpenRouter API key:

```env
OPENROUTER_API_KEY=your_actual_api_key_here
```

### 3. Get OpenRouter API Key

1. Visit [OpenRouter](https://openrouter.ai/)
2. Sign up for an account
3. Get your API key from the dashboard
4. Add it to your `.env` file

### 4. Development

Start the development server:

```bash
npm run dev
```

The server will run on `http://localhost:5000`

### 5. Production Build

Build the TypeScript code:

```bash
npm run build
```

Start the production server:

```bash
npm start
```

## API Endpoints

### Health Check
- `GET /api/health` - Server health status

### AI Chat
- `POST /api/chat` - Send a message to Gemini AI
  ```json
  {
    "message": "Hello, how are you?",
    "model": "google/gemini-pro" // optional
  }
  ```

### Available Models
- `GET /api/models` - Get available Gemini models

## Example Usage

### Chat with Gemini

```bash
curl -X POST http://localhost:5000/api/chat \
  -H "Content-Type: application/json" \
  -d '{"message": "What is the capital of France?"}'
```

### Get Available Models

```bash
curl http://localhost:5001/api/models
```

## Available Gemini Models

- `google/gemini-pro` - Standard Gemini Pro model
- `google/gemini-pro-vision` - Gemini Pro with vision capabilities
- `google/gemini-flash-1.5` - Faster Gemini Flash model

## Project Structure

```
backend/
├── src/
│   ├── server.ts              # Main server file
│   └── services/
│       └── openrouter.service.ts  # OpenRouter API service
├── dist/                      # Compiled JavaScript (after build)
├── package.json
├── tsconfig.json
└── .env                       # Environment variables (create from env.example)
```

## Development

The project uses `ts-node-dev` for development with hot reloading. Any changes to TypeScript files will automatically restart the server.

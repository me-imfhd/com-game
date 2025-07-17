export const config = {
  port: process.env.PORT || 3000,
  env: process.env.NODE_ENV || "development",
  cors: {
    origin: process.env.CORS_ORIGIN || "*",
  },
  api: {
    prefix: "/api/v1",
  },
} as const;

export type Config = typeof config;

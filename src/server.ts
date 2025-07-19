import cors from "cors";
import type {
  Application,
  ErrorRequestHandler,
  NextFunction,
  Request,
  Response,
} from "express";
import express from "express";
import helmet from "helmet";
import { config, type Config } from "./config";
import { AppError } from "./utils/errors";

export class Server {
  private app: Application;
  private appConfig: Config;

  constructor(customConfig: Config = config) {
    this.app = express();
    this.appConfig = customConfig;
    this.setupMiddleware();
    this.setupRoutes();
    this.setupErrorHandling();
  }

  private setupMiddleware(): void {
    // Security middleware
    this.app.use(helmet());
    this.app.use(cors(this.appConfig.cors));

    // Body parsing
    this.app.use(express.json());
    this.app.use(express.urlencoded({ extended: true }));
  }

  private setupRoutes(): void {
    // Health check
    this.app.get("/health", (req: Request, res: Response) => {
      res.json({ status: "ok", timestamp: new Date().toISOString() });
    });

    // Original API routes
    this.app.get(
      `${this.appConfig.api.prefix}/`,
      (req: Request, res: Response) => {
        res.json({ message: "Welcome to the API!" });
      }
    );

    // 404 handler for undefined routes
    this.app.use((req: Request, res: Response, next: NextFunction) => {
      next(new AppError(404, "fail", `Route ${req.originalUrl} not found`));
    });
  }

  private setupErrorHandling(): void {
    // Error handling middleware
    const errorHandler: ErrorRequestHandler = (
      err: Error,
      req: Request,
      res: Response,
      _next: NextFunction
    ) => {
      console.error(err);
      // Log relevant request details with including what it is
      console.log("Method:", req.method);
      console.log("Original URL:", req.originalUrl);
      console.log("Body:", req.body);
      console.log("Query:", req.query);
      console.log("Params:", req.params);
      console.log("Headers:", req.headers);

      if (err instanceof AppError) {
        res.status(err.statusCode).json(err.toErrorResponse());
        return;
      }

      res
        .status(500)
        .json(
          new AppError(500, "error", "Internal server error").toErrorResponse()
        );
    };

    this.app.use(errorHandler);
  }

  public async start(): Promise<void> {
    try {
      this.app.listen(this.appConfig.port, () => {
        console.log(
          `Server is running in ${this.appConfig.env} mode on port ${this.appConfig.port}`
        );
      });
    } catch (error) {
      console.error("Error starting server:", error);
      process.exit(1);
    }
  }

  public getApp(): Application {
    return this.app;
  }
}

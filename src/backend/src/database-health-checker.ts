export interface DatabaseHealthChecker {
  check(): Promise<void>;
}

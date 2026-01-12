/**
 * Environment Loader - Robust .env file loader for Nx + pnpm monorepo
 * 
 * Finds and loads the root .env file by walking up from:
 * 1. process.cwd() (current working directory)
 * 2. __dirname (location of this module, works in dist builds)
 * 
 * Validates repo root by checking for pnpm-workspace.yaml or root package.json
 * This works regardless of where Node process starts (repo root, dist/, etc.)
 */

import * as fs from "fs";
import * as path from "path";
import dotenv from "dotenv";

let envLoaded = false;
let envPath: string | null = null;

/**
 * Find repository root by walking up directories
 * Looks for .env file and validates it's the repo root
 */
function findRepoRoot(startDir: string): string | null {
  let currentDir = startDir;
  let iterations = 0;
  const maxIterations = 10; // Safety limit

  while (iterations < maxIterations) {
    // Check if .env exists
    const envFile = path.join(currentDir, ".env");
    const envExists = fs.existsSync(envFile);

    // Check for repo root markers
    const workspaceFile = path.join(currentDir, "pnpm-workspace.yaml");
    const packageFile = path.join(currentDir, "package.json");
    const hasWorkspace = fs.existsSync(workspaceFile);
    const hasPackageJson = fs.existsSync(packageFile);

    // If .env exists and we have repo markers, we found it
    if (envExists && (hasWorkspace || hasPackageJson)) {
      // Extra validation: check if package.json has "private": true (typical for monorepo root)
      if (hasPackageJson) {
        try {
          const packageContent = fs.readFileSync(packageFile, "utf-8");
          const packageJson = JSON.parse(packageContent);
          if (packageJson.private || hasWorkspace) {
            return currentDir;
          }
        } catch {
          // If we can't read package.json but have workspace file, still return
          if (hasWorkspace && envExists) {
            return currentDir;
          }
        }
      }
    }

    // Move up one directory
    const parentDir = path.dirname(currentDir);
    if (parentDir === currentDir) {
      // Reached filesystem root
      break;
    }
    currentDir = parentDir;
    iterations++;
  }

  return null;
}

/**
 * Load environment variables from repo root .env file
 * Call this at the very top of your main.ts files
 */
export function loadEnv(): void {
  // Only load once
  if (envLoaded) {
    return;
  }

  const debug = process.env.ENV_LOADER_DEBUG === "true";

  // Try multiple starting points
  const startDirs = [
    process.cwd(), // Where Node process started
    __dirname, // Where this module is (handles dist builds)
    path.resolve(__dirname, "../../../.."), // Relative fallback from packages/libs/env-loader/src
  ];

  for (const startDir of startDirs) {
    const repoRoot = findRepoRoot(startDir);
    if (repoRoot) {
      envPath = path.join(repoRoot, ".env");
      
      // Load the .env file
      const result = dotenv.config({ path: envPath });
      
      if (result.error) {
        if (debug) {
          console.warn(`[env-loader] Failed to load .env from ${envPath}:`, result.error.message);
        }
        continue;
      }

      envLoaded = true;
      
      if (debug) {
        console.log(`[env-loader] Loaded .env from: ${envPath}`);
        console.log(`[env-loader] Repo root: ${repoRoot}`);
      }
      
      return;
    }
  }

  // If we get here, .env was not found
  if (debug) {
    console.warn("[env-loader] Could not find repo root .env file");
    console.warn("[env-loader] Searched from:", startDirs);
  }
}

/**
 * Get the path where .env was loaded from (for debugging)
 */
export function getEnvPath(): string | null {
  return envPath;
}

// Auto-load on module import (runs once when this module is first imported)
loadEnv();


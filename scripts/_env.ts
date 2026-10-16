// Loads .env.local for command-line scripts (Next.js loads it by itself for the app).
export function loadEnv() {
  try {
    process.loadEnvFile(".env.local");
  } catch {
    // No .env.local: rely on variables already set (e.g. on Netlify).
  }
}

export function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    console.error(`${name} is not set. Copy .env.example to .env.local and fill it in.`);
    process.exit(1);
  }
  return value;
}

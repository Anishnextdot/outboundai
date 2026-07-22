import { fileURLToPath } from "url";
import { dirname } from "path";

const projectRoot = dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  // The agents import server-only SDKs; keep them out of the client bundle.
  serverExternalPackages: ["@anthropic-ai/sdk", "@langchain/langgraph", "@supabase/supabase-js", "nodemailer"],
  // A stray package-lock.json in the home dir confuses Next's root detection.
  outputFileTracingRoot: projectRoot,
  // Single-worker prerender: this box OOMs the parallel static-generation
  // workers (VirtualAlloc failures). One worker keeps peak memory low.
  experimental: { cpus: 1, workerThreads: false },
};

export default nextConfig;

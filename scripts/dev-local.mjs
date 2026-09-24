import { existsSync, lstatSync, mkdirSync, rmSync, symlinkSync } from "node:fs";
import { join } from "node:path";
import { spawn } from "node:child_process";

const projectRoot = process.cwd();
const localBuildDir = "/tmp/facturepro-next";
const nextDir = join(projectRoot, ".next");

mkdirSync(localBuildDir, { recursive: true });
if (existsSync(nextDir)) {
  const stat = lstatSync(nextDir);
  if (!stat.isSymbolicLink()) rmSync(nextDir, { recursive: true, force: true });
}
if (!existsSync(nextDir)) symlinkSync(localBuildDir, nextDir, "dir");

const nextBinary = join(projectRoot, "node_modules", ".bin", "next");
const child = spawn(nextBinary, ["dev", "--turbopack"], { cwd: projectRoot, stdio: "inherit", env: { ...process.env, NODE_PATH: join(projectRoot, "node_modules") } });
child.on("exit", (code, signal) => { if (signal !== null) process.kill(process.pid, signal); else process.exit(code ?? 1); });

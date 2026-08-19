import { createClient } from "@ia/db";
import { loadConfig } from "../config";
import { runBlacklistCommand } from "./blacklist";

const config = loadConfig();
const { db, close } = createClient(config.databaseUrl);

try {
  console.log(await runBlacklistCommand(db, process.argv.slice(2)));
} catch (err) {
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
} finally {
  await close();
}

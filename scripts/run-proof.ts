import { spawnSync } from "node:child_process";
import { writeProofSummary } from "./write-proof-summary";

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const external = args.includes("--external");
  const testArgs = args.filter((arg) => arg !== "--external");
  const env = { ...process.env };

  if (external) {
    env.VISUAL_GLITCH_PROOF_EXTERNAL = "1";
    process.env.VISUAL_GLITCH_PROOF_EXTERNAL = "1";
  } else {
    delete env.VISUAL_GLITCH_PROOF_EXTERNAL;
    delete process.env.VISUAL_GLITCH_PROOF_EXTERNAL;
  }

  const playwrightCli = require.resolve("@playwright/test/cli");
  const testResult = spawnSync(
    process.execPath,
    [playwrightCli, "test", "--project=proof", ...testArgs],
    {
      cwd: process.cwd(),
      env,
      stdio: "inherit",
    },
  );

  if (testResult.error) {
    throw testResult.error;
  }

  let summaryStatus = 0;
  try {
    await writeProofSummary();
  } catch (error) {
    summaryStatus = 1;
    console.error(error);
  }

  const testStatus = testResult.status ?? 1;
  process.exitCode = testStatus === 0 ? summaryStatus : testStatus;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

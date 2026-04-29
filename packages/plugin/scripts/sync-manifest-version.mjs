import { readFile, writeFile } from "node:fs/promises";

const PACKAGE_JSON_PATH = new URL("../package.json", import.meta.url);
const MANIFEST_JSON_PATH = new URL("../openclaw.plugin.json", import.meta.url);

async function main() {
  const packageJson = JSON.parse(await readFile(PACKAGE_JSON_PATH, "utf8"));
  const manifestJson = JSON.parse(await readFile(MANIFEST_JSON_PATH, "utf8"));

  if (!packageJson.version || typeof packageJson.version !== "string") {
    throw new Error("package.json version is missing or invalid");
  }

  if (manifestJson.version === packageJson.version) {
    console.log(`openclaw.plugin.json already synced at ${packageJson.version}`);
    return;
  }

  manifestJson.version = packageJson.version;
  await writeFile(MANIFEST_JSON_PATH, `${JSON.stringify(manifestJson, null, 2)}\n`, "utf8");
  console.log(`synced openclaw.plugin.json version -> ${packageJson.version}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import solc from "solc";

const root = process.cwd();
const contractsDir = path.join(root, "contracts");
const artifactsDir = path.join(root, "artifacts", "contracts");

function listSolidityFiles(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      return listSolidityFiles(fullPath);
    }
    return entry.isFile() && entry.name.endsWith(".sol") ? [fullPath] : [];
  });
}

const sources = Object.fromEntries(
  listSolidityFiles(contractsDir).map((filePath) => [
    path.relative(root, filePath).replaceAll("\\", "/"),
    { content: fs.readFileSync(filePath, "utf8") }
  ])
);

const input = {
  language: "Solidity",
  sources,
  settings: {
    optimizer: {
      enabled: true,
      runs: 200
    },
    outputSelection: {
      "*": {
        "*": ["abi", "evm.bytecode.object"]
      }
    }
  }
};

const output = JSON.parse(solc.compile(JSON.stringify(input)));
const errors = output.errors ?? [];

for (const error of errors) {
  const stream = error.severity === "error" ? process.stderr : process.stdout;
  stream.write(`${error.formattedMessage}\n`);
}

if (errors.some((error) => error.severity === "error")) {
  process.exit(1);
}

fs.rmSync(artifactsDir, { recursive: true, force: true });

for (const [sourceName, contracts] of Object.entries(output.contracts ?? {})) {
  for (const [contractName, compiled] of Object.entries(contracts)) {
    const bytecode = compiled.evm.bytecode.object ?? "";
    const bytes = bytecode.length / 2;
    const sourceArtifactDir = path.join(artifactsDir, path.dirname(sourceName));
    fs.mkdirSync(sourceArtifactDir, { recursive: true });
    fs.writeFileSync(
      path.join(sourceArtifactDir, `${contractName}.json`),
      JSON.stringify(
        {
          contractName,
          sourceName,
          abi: compiled.abi,
          bytecode: bytecode ? `0x${bytecode}` : "0x"
        },
        null,
        2
      )
    );
    process.stdout.write(`${sourceName}:${contractName} compiled, ${bytes} bytes\n`);
  }
}

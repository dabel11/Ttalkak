const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const schemaPath = path.join(root, "shared", "make-api.schema.json");
const jsOutputPath = path.join(root, "shared", "make-api-contract.js");
const javaOutputPath = path.join(root, "backend", "src", "main", "java", "com", "ttalkak", "make", "MakeApiContract.java");

function readContract() {
  const schema = JSON.parse(fs.readFileSync(schemaPath, "utf8"));
  const contract = schema["x-ttalkak-contract"];
  const requestIdSchema = schema.$defs?.ImproveRequest?.properties?.requestId;
  const errorEnum = schema.$defs?.ApiError?.properties?.code?.enum || [];
  const errorCodes = Object.values(contract?.errorCodes || {});
  if (!contract || requestIdSchema?.maxLength !== contract.requestIdMaxLength ||
      errorCodes.some((code) => !errorEnum.includes(code))) {
    throw new Error("Make API schema requestId limits are inconsistent.");
  }
  return contract;
}

function renderJs(contract) {
  return `// GENERATED FILE. Edit shared/make-api.schema.json and run node scripts/build-make-api-contract.cjs.\n` +
    `export const MAKE_REQUEST_ID_MAX_LENGTH = ${contract.requestIdMaxLength};\n` +
    `export const MAKE_API_PATHS = Object.freeze(${JSON.stringify(contract.paths, null, 2)});\n` +
    `export const MAKE_ERROR_CODES = Object.freeze(${JSON.stringify(contract.errorCodes, null, 2)});\n`;
}

function javaString(value) {
  return JSON.stringify(String(value));
}

function renderJava(contract) {
  return `// GENERATED FILE. Edit shared/make-api.schema.json and run node scripts/build-make-api-contract.cjs.\n` +
    `package com.ttalkak.make;\n\n` +
    `public final class MakeApiContract {\n` +
    `    public static final int REQUEST_ID_MAX_LENGTH = ${contract.requestIdMaxLength};\n` +
    `    public static final String IMPROVE_PATH = ${javaString(contract.paths.improve)};\n` +
    `    public static final String THREADS_PATH = ${javaString(contract.paths.threads)};\n` +
    `    public static final String THREAD_PATH = ${javaString(contract.paths.thread)};\n` +
    `    public static final String REQUEST_ID_INVALID = ${javaString(contract.errorCodes.requestIdInvalid)};\n` +
    `    public static final String REQUEST_ID_REUSED = ${javaString(contract.errorCodes.requestIdReused)};\n` +
    `    public static final String THREAD_CONCURRENTLY_UPDATED = ${javaString(contract.errorCodes.threadConcurrentlyUpdated)};\n\n` +
    `    private MakeApiContract() {}\n` +
    `}\n`;
}

function expectedOutputs() {
  const contract = readContract();
  return { js: renderJs(contract), java: renderJava(contract) };
}

function build() {
  const outputs = expectedOutputs();
  fs.writeFileSync(jsOutputPath, outputs.js, "utf8");
  fs.writeFileSync(javaOutputPath, outputs.java, "utf8");
}

if (require.main === module) build();
module.exports = { build, expectedOutputs, javaOutputPath, jsOutputPath, schemaPath };

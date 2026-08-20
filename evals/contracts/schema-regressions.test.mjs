import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import test from "node:test";

const require = createRequire(import.meta.url);
const ajvModule = process.env.AJV_2020_MODULE ?? "ajv/dist/2020.js";
let Ajv2020;
try {
  const loaded = require(ajvModule);
  Ajv2020 = loaded.default ?? loaded;
} catch (error) {
  throw new Error(
    "Schema regressions require Ajv 8. Set AJV_2020_MODULE to its dist/2020.js module or install Ajv in the evaluation harness.",
    { cause: error },
  );
}

const loadSchema = (name) =>
  JSON.parse(readFileSync(new URL(name, import.meta.url), "utf8"));
const commonSchema = loadSchema("common.schema.json");
const fixtureSchema = loadSchema("fixture.schema.json");
const environmentSchema = loadSchema("comparison-environment.schema.json");
const resultSchema = loadSchema("evaluator-result.schema.json");
const runArtifactSchema = loadSchema("run-artifact.schema.json");
const auxiliarySchemas = [
  loadSchema("case.schema.json"),
  loadSchema("holdout-commitment.schema.json"),
  loadSchema("oracle.schema.json"),
];

const ajv = new Ajv2020({ allErrors: true, strict: false, validateFormats: false });
ajv.addSchema(commonSchema);
const validateFixture = ajv.compile(fixtureSchema);
const validateEnvironment = ajv.compile(environmentSchema);
const validateResult = ajv.compile(resultSchema);
const validateRunArtifact = ajv.compile(runArtifactSchema);
for (const schema of auxiliarySchemas) {
  ajv.compile(schema);
}

const digest = `sha256:${"a".repeat(64)}`;
const otherDigest = `sha256:${"b".repeat(64)}`;
const revision = "c".repeat(40);
const timestamp = "2026-08-20T00:00:00Z";

test("all public schemas compile under Draft 2020-12", () => {
  assert.ok(ajv.getSchema(commonSchema.$id));
  for (const schema of [
    fixtureSchema,
    environmentSchema,
    resultSchema,
    runArtifactSchema,
    ...auxiliarySchemas,
  ]) {
    assert.ok(ajv.getSchema(schema.$id), schema.$id);
  }
});

function expectValidation(validate, instance, expected, label) {
  assert.equal(
    validate(instance),
    expected,
    `${label}: ${JSON.stringify(validate.errors, null, 2)}`,
  );
}

const loadedArtifact = {
  logicalName: "SKILL.md",
  source: "adapter/SKILL.md",
  scope: "workspace",
  order: 0,
  digest,
};
const skillPackage = {
  name: "front-not-end",
  version: "0.1.0",
  packageDigest: digest,
  loadedArtifacts: [loadedArtifact],
  helpers: [],
  dependencies: [],
};

const validFixture = {
  schemaVersion: "0.1",
  fixtureId: "fixture-one",
  repository: { revision, treeDigest: digest, clean: true },
  materialization: {
    method: "git-worktree",
    recipe: { path: "recipes/materialize.json", digest },
    resultDigest: digest,
  },
  agentProjection: {
    root: "workspace",
    allowlist: ["task.md", "src"],
    denylist: [
      "control/oracle",
      "control/holdout",
      "control/evaluator",
      "control/reports",
    ],
    projectionDigest: digest,
    preflightCommand: "verify-projection",
    containmentPolicy: {
      resolution: "realpath-descendant-of-declared-root",
      rejectSymlinkEscape: true,
      failClosed: true,
    },
  },
  baseline: { agentsFile: "baseline/AGENTS.md", digest },
};

test("fixture schema rejects every reviewed projection traversal", () => {
  expectValidation(validateFixture, validFixture, true, "valid fixture");

  for (const candidate of ["/", "../holdout", "C:/holdout", "..\\holdout"]) {
    const invalid = structuredClone(validFixture);
    invalid.agentProjection.allowlist = [candidate];
    expectValidation(validateFixture, invalid, false, `allowlist ${candidate}`);
  }

  const invalidDenylist = structuredClone(validFixture);
  invalidDenylist.agentProjection.denylist[1] = "../holdout";
  expectValidation(validateFixture, invalidDenylist, false, "denylist traversal");

  const invalidAgents = structuredClone(validFixture);
  invalidAgents.baseline.agentsFile = "/tmp/AGENTS.md";
  expectValidation(validateFixture, invalidAgents, false, "absolute AGENTS.md");
});

function environmentFor(arm) {
  const base = {
    schemaVersion: "0.1",
    caseId: "case-one",
    runId: "run-one",
    arm,
    capturedAt: timestamp,
    host: { name: "Codex", version: "1", build: "1" },
    model: {
      provider: "OpenAI",
      modelId: "gpt",
      version: "1",
      reasoningEffort: "high",
      serviceTier: "priority",
    },
    outerInstructions: [],
    skills: [],
    plugins: [],
    hostSettings: { values: {}, secretNames: [], digest },
    toolPermissions: {
      tools: [],
      filesystem: ["workspace"],
      network: "disabled",
      approvalPolicy: "never",
      digest,
    },
    operatingEnvironment: {
      os: "macOS",
      architecture: "arm64",
      timezone: "UTC",
      locale: "en-US",
      runtimeVersions: {},
      environmentVariableNames: [],
      digest,
    },
    frozenInputs: {
      authoringRevision: revision,
      caseDigest: digest,
      oracleDigest: digest,
      holdoutCommitmentDigest: digest,
    },
    repository: {
      revisionBefore: revision,
      treeDigestBefore: digest,
      cleanBefore: true,
    },
    agentInputProjection: {
      declaredRoot: "workspace",
      files: [
        {
          logicalName: "task",
          source: "fixture/task.md",
          path: "task.md",
          scope: "workspace",
          order: 0,
          digest,
        },
      ],
      projectionDigest: digest,
      controlRootMounted: false,
      unexpectedReadableArtifacts: [],
      resolvedPathsOutsideRoot: [],
      containmentCheckPassed: true,
      preflightPassed: true,
    },
    intervention: {
      kind: arm,
      artifacts: [],
      sourceRevision: null,
      skillPackages: [],
      digest,
    },
  };

  if (arm === "concise-agents") {
    base.intervention.artifacts = [
      { ...loadedArtifact, logicalName: "AGENTS.md", source: "baseline/AGENTS.md" },
    ];
    base.intervention.sourceRevision = revision;
  }
  if (arm === "front-not-end-v0.1") {
    base.intervention.artifacts = [loadedArtifact];
    base.intervention.sourceRevision = revision;
    base.intervention.skillPackages = [skillPackage];
  }
  return base;
}

test("environment schema binds arm labels to actual interventions", () => {
  for (const arm of ["bare-codex", "concise-agents", "front-not-end-v0.1"]) {
    expectValidation(validateEnvironment, environmentFor(arm), true, arm);
  }

  const mismatch = environmentFor("bare-codex");
  mismatch.intervention.kind = "front-not-end-v0.1";
  expectValidation(validateEnvironment, mismatch, false, "arm/kind mismatch");

  const bareWithSkill = environmentFor("bare-codex");
  bareWithSkill.intervention.skillPackages = [skillPackage];
  expectValidation(validateEnvironment, bareWithSkill, false, "bare skill package");
});

test("environment schema captures dirty and contaminated preflight observations", () => {
  const failed = environmentFor("bare-codex");
  failed.repository.cleanBefore = false;
  failed.agentInputProjection.controlRootMounted = true;
  failed.agentInputProjection.unexpectedReadableArtifacts = ["../control/oracle.json"];
  failed.agentInputProjection.resolvedPathsOutsideRoot = ["/control/oracle.json"];
  failed.agentInputProjection.containmentCheckPassed = false;
  failed.agentInputProjection.preflightPassed = false;
  expectValidation(validateEnvironment, failed, true, "failed preflight capture");
});

const validResult = {
  schemaVersion: "0.1",
  evaluatorVersion: "0.1.0",
  caseId: "case-one",
  runId: "run-one",
  arm: "bare-codex",
  inputDigests: {
    case: digest,
    oracle: digest,
    environment: digest,
    runArtifact: digest,
  },
  runValidity: "VALID",
  invalidReasons: [],
  requirementResults: [],
  derivedCompletionState: "PASS",
  benchmarkExpectationResult: "SATISFIED",
  selfReportedCompletionState: "PASS",
  unsupportedPass: false,
  metrics: { score: 1 },
  evaluatedAt: timestamp,
};

test("result schema models valid and invalid runs as disjoint states", () => {
  expectValidation(validateResult, validResult, true, "valid result");

  const validWithInvalidState = structuredClone(validResult);
  validWithInvalidState.derivedCompletionState = "NOT_DERIVED_INVALID_RUN";
  validWithInvalidState.benchmarkExpectationResult = "INVALID";
  validWithInvalidState.invalidReasons = ["not valid"];
  expectValidation(validateResult, validWithInvalidState, false, "valid invalid-only state");

  const invalid = structuredClone(validResult);
  invalid.runValidity = "INVALID_CONTAMINATED";
  invalid.invalidReasons = ["control root readable"];
  invalid.requirementResults = [];
  invalid.derivedCompletionState = "NOT_DERIVED_INVALID_RUN";
  invalid.benchmarkExpectationResult = "INVALID";
  invalid.unsupportedPass = true;
  invalid.metrics = {};
  expectValidation(validateResult, invalid, true, "valid invalid result");

  const contradictory = structuredClone(invalid);
  contradictory.invalidReasons = [];
  contradictory.derivedCompletionState = "PASS";
  contradictory.benchmarkExpectationResult = "SATISFIED";
  contradictory.unsupportedPass = false;
  contradictory.metrics = { score: 1 };
  expectValidation(validateResult, contradictory, false, "contradictory invalid result");
});

const validRunArtifact = {
  schemaVersion: "0.1",
  caseId: "case-one",
  runId: "run-one",
  arm: "bare-codex",
  caseDigest: digest,
  environmentDigest: digest,
  startedAt: timestamp,
  finishedAt: timestamp,
  taskOutput: { locator: "task-output", digest, mediaType: "text/plain" },
  selfReportedCompletionState: "PASS",
  toolInvocations: [
    {
      invocationId: "test-run",
      tool: "npm test",
      startedAt: timestamp,
      finishedAt: timestamp,
      repositoryRevision: revision,
      repositoryTreeDigestBefore: digest,
      repositoryTreeDigestAfter: otherDigest,
      outcome: "SUCCEEDED",
      output: { locator: "test-output", digest, mediaType: "text/plain" },
    },
  ],
  evidence: [
    {
      evidenceId: "test-evidence",
      category: "test-output",
      artifact: { locator: "test-output", digest, mediaType: "text/plain" },
      producer: {
        kind: "repository-command",
        name: "npm test",
        version: null,
        digest: null,
      },
      producedAt: timestamp,
      repositoryRevision: revision,
      repositoryTreeDigest: otherDigest,
      sourceInvocationIds: ["test-run"],
      outcome: "PASSED",
      enforcementOrigin: "adapter-authored",
      agentClaimedAssuranceLevel: "A1",
    },
  ],
  repositoryAfter: { revision, treeDigest: otherDigest, dirty: true },
  observations: {
    elapsedMilliseconds: 1,
    inputTokens: null,
    outputTokens: null,
    cost: null,
    currency: null,
  },
};

test("run artifact requires tree identity on invocations and evidence", () => {
  expectValidation(validateRunArtifact, validRunArtifact, true, "tree-bound run");

  const missingEvidenceTree = structuredClone(validRunArtifact);
  delete missingEvidenceTree.evidence[0].repositoryTreeDigest;
  expectValidation(validateRunArtifact, missingEvidenceTree, false, "evidence tree missing");

  const missingInvocationTree = structuredClone(validRunArtifact);
  delete missingInvocationTree.toolInvocations[0].repositoryTreeDigestAfter;
  expectValidation(validateRunArtifact, missingInvocationTree, false, "invocation tree missing");
});

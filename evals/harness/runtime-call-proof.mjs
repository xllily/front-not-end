import { registerHooks } from "node:module";

const blockedAgentModules = new Set([
  "async_hooks",
  "inspector",
  "module",
  "node:async_hooks",
  "node:inspector",
  "node:module",
  "node:vm",
  "vm",
]);
let proofSequence = 0;

function lockProcessModuleBackdoors() {
  for (const property of ["_linkedBinding", "binding", "dlopen", "getBuiltinModule"]) {
    if (Object.hasOwn(process, property)) {
      Object.defineProperty(process, property, {
        configurable: false,
        enumerable: false,
        value: undefined,
        writable: false,
      });
    }
  }
}

export async function installRuntimeCallProof({ exportName, helperURL }) {
  if (!/^[A-Za-z_$][A-Za-z0-9_$]*$/u.test(exportName)) {
    throw new TypeError("A valid runtime proof export name is required");
  }

  const canonicalHelperURL = new URL(helperURL);
  canonicalHelperURL.search = "";
  canonicalHelperURL.hash = "";
  if (!canonicalHelperURL.href.startsWith("file:///workspace/")) {
    throw new TypeError("Runtime proof helpers must be inside the tracer workspace");
  }

  const proofId = `${proofSequence}-${exportName}`;
  proofSequence += 1;
  const attestationURL = `front-not-end:attestation/${proofId}`;
  const wrapperURL = `front-not-end:wrapper/${proofId}`;
  const realHelperURL = new URL(canonicalHelperURL);
  realHelperURL.searchParams.set("front-not-end-real", proofId);

  const attestationSource = `import { AsyncLocalStorage } from "node:async_hooks";

const storage = new AsyncLocalStorage();
const getStore = storage.getStore.bind(storage);
const run = storage.run.bind(storage);

export function isPlatformRepository(repository) {
  return getStore() === repository;
}

export function runWithPlatformRepository(repository, operation) {
  return run(repository, operation);
}
`;
  const wrapperSource = `import * as platform from ${JSON.stringify(realHelperURL.href)};
import { runWithPlatformRepository } from ${JSON.stringify(attestationURL)};

export * from ${JSON.stringify(realHelperURL.href)};

export function ${exportName}(repository, ...args) {
  return runWithPlatformRepository(
    repository,
    () => platform.${exportName}(repository, ...args),
  );
}
`;

  const hooks = registerHooks({
    load(url, context, nextLoad) {
      if (url === attestationURL) {
        return { format: "module", shortCircuit: true, source: attestationSource };
      }
      if (url === wrapperURL) {
        return { format: "module", shortCircuit: true, source: wrapperSource };
      }
      const loaded = nextLoad(url, context);
      if (url.startsWith("file:///workspace/") && loaded.format === "commonjs") {
        throw new TypeError("Agent workspace cannot load CommonJS modules");
      }
      return loaded;
    },
    resolve(specifier, context, nextResolve) {
      if (
        blockedAgentModules.has(specifier) &&
        !(specifier === "node:async_hooks" && context.parentURL === attestationURL)
      ) {
        throw new TypeError(`Agent modules cannot import ${specifier}`);
      }
      if (specifier === attestationURL) {
        if (context.parentURL !== import.meta.url && context.parentURL !== wrapperURL) {
          throw new TypeError("Runtime proof attestation is control-only");
        }
        return { shortCircuit: true, url: attestationURL };
      }
      if (specifier === wrapperURL) {
        throw new TypeError("Runtime proof wrapper is not directly importable");
      }

      let requestedURL;
      try {
        requestedURL = new URL(specifier, context.parentURL);
      } catch {
        return nextResolve(specifier, context);
      }
      const requestedCanonicalURL = new URL(requestedURL);
      requestedCanonicalURL.search = "";
      requestedCanonicalURL.hash = "";
      if (requestedCanonicalURL.href !== canonicalHelperURL.href) {
        return nextResolve(specifier, context);
      }
      if (requestedURL.href === realHelperURL.href && context.parentURL === wrapperURL) {
        return nextResolve(realHelperURL.href, context);
      }
      return { shortCircuit: true, url: wrapperURL };
    },
  });

  try {
    const { isPlatformRepository } = await import(attestationURL);
    lockProcessModuleBackdoors();
    return {
      assertRepositoryCall(repository) {
        if (!isPlatformRepository(repository)) {
          const error = new Error(
            `Tracer runtime path proof failed for platform export ${exportName}`,
          );
          error.code = "ERR_TRACER_RUNTIME_PATH";
          throw error;
        }
      },
      dispose() {
        hooks.deregister();
      },
    };
  } catch (error) {
    hooks.deregister();
    throw error;
  }
}

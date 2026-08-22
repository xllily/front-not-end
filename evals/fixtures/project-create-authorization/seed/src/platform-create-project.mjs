function forbidden() {
  const error = new Error("Project creation is not allowed");
  error.code = "FORBIDDEN";
  return error;
}

export function createProject(repository, requestContext, { name, operationId } = {}) {
  if (!requestContext.permissions.includes("project:create")) throw forbidden();
  if (typeof name !== "string" || name.trim().length < 1 || name.trim().length > 80) {
    throw new RangeError("Invalid project name");
  }
  if (typeof operationId !== "string" || operationId.length < 1 || operationId.length > 128) {
    throw new TypeError("Invalid operation identifier");
  }

  return repository.createOnce({
    tenantId: requestContext.tenantId,
    operationId,
    name: name.trim(),
  });
}

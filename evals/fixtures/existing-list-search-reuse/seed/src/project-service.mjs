export class ProjectService {
  constructor({ projects, requestContext }) {
    this.projects = projects;
    this.requestContext = requestContext;
  }

  async getProject(projectId) {
    return this.projects.findById(this.requestContext.tenantId, projectId);
  }
}

package types

type Environment struct {
	ID                uint   `json:"id"`
	ProjectID         uint   `json:"project_id"`
	ClusterID         uint   `json:"cluster_id"`
	GitInstallationID uint   `json:"git_installation_id"`
	GitRepoOwner      string `json:"git_repo_owner"`
	GitRepoName       string `json:"git_repo_name"`

	Name string `json:"name"`
}

type CreateEnvironmentRequest struct {
	Name         string `json:"name" form:"required"`
	GitRepoOwner string `json:"git_repo_owner" form:"required"`
	GitRepoName  string `json:"git_repo_name" form:"required"`
}

type Deployment struct {
	ID            uint   `json:"id"`
	EnvironmentID uint   `json:"environment_id"`
	Namespace     string `json:"namespace"`
	Status        string `json:"status"`
	Subdomain     string `json:"subdomain"`
	PullRequestID uint   `json:"pull_request_id"`
}

type CreateDeploymentRequest struct {
	Namespace     string `json:"namespace" form:"required"`
	PullRequestID uint   `json:"pull_request_id" form:"required"`
}

type FinalizeDeploymentRequest struct {
	Namespace string `json:"namespace" form:"required"`
	Subdomain string `json:"subdomain"`
}

type GetDeploymentRequest struct {
	Namespace string `schema:"namespace" form:"required"`
}

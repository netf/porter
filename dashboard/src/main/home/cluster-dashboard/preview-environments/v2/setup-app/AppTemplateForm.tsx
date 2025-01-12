import React, { useCallback, useEffect, useMemo, useState } from "react";
import { FormProvider, useForm } from "react-hook-form";

import VerticalSteps from "components/porter/VerticalSteps";
import {
  PorterAppFormData,
  SourceOptions,
  applyPreviewOverrides,
  clientAppFromProto,
  clientAppToProto,
  porterAppFormValidator,
} from "lib/porter-apps";
import {
  defaultSerialized,
  deserializeService,
} from "lib/porter-apps/services";
import { zodResolver } from "@hookform/resolvers/zod";
import { useLatestRevision } from "main/home/app-dashboard/app-view/LatestRevisionContext";
import Spacer from "components/porter/Spacer";
import ServiceList from "main/home/app-dashboard/validate-apply/services-settings/ServiceList";
import Text from "components/porter/Text";
import EnvSettings from "main/home/app-dashboard/validate-apply/app-settings/EnvSettings";
import api from "shared/api";
import { z } from "zod";
import { populatedEnvGroup } from "main/home/app-dashboard/validate-apply/app-settings/types";
import { useQuery } from "@tanstack/react-query";
import { Redirect } from "react-router";
import Button from "components/porter/Button";
import { useAppValidation } from "lib/hooks/useAppValidation";
import { PorterApp } from "@porter-dev/api-contracts";
import axios from "axios";
import GithubActionModal from "main/home/app-dashboard/new-app-flow/GithubActionModal";

const AppTemplateForm: React.FC = () => {
  const [step, setStep] = useState(0);
  const [validatedAppProto, setValidatedAppProto] = useState<PorterApp | null>(
    null
  );
  const [createError, setCreateError] = useState("");
  const [showGHAModal, setShowGHAModal] = useState(false);
  const [{ variables, secrets }, setFinalizedAppEnv] = useState<{
    variables: Record<string, string>;
    secrets: Record<string, string>;
  }>({
    variables: {},
    secrets: {},
  });

  const {
    porterApp,
    appEnv,
    latestProto,
    servicesFromYaml,
    clusterId,
    projectId,
    deploymentTarget,
  } = useLatestRevision();
  const { validateApp } = useAppValidation({
    deploymentTargetID: deploymentTarget.id,
    creating: true,
  });

  const { data: baseEnvGroups = [] } = useQuery(
    ["getAllEnvGroups", projectId, clusterId],
    async () => {
      const res = await api.getAllEnvGroups(
        "<token>",
        {},
        {
          id: projectId,
          cluster_id: clusterId,
        }
      );

      const { environment_groups } = await z
        .object({
          environment_groups: z.array(populatedEnvGroup).default([]),
        })
        .parseAsync(res.data);

      return environment_groups;
    }
  );

  const latestSource: SourceOptions = useMemo(() => {
    if (porterApp.image_repo_uri) {
      const [repository, tag] = porterApp.image_repo_uri.split(":");
      return {
        type: "docker-registry",
        image: {
          repository,
          tag,
        },
      };
    }

    return {
      type: "github",
      git_repo_id: porterApp.git_repo_id ?? 0,
      git_repo_name: porterApp.repo_name ?? "",
      git_branch: porterApp.git_branch ?? "",
      porter_yaml_path: porterApp.porter_yaml_path ?? "./porter.yaml",
    };
  }, [porterApp]);

  const withPreviewOverrides = useMemo(() => {
    return applyPreviewOverrides({
      app: clientAppFromProto({
        proto: latestProto,
        overrides: servicesFromYaml,
        variables: appEnv?.variables,
        secrets: appEnv?.secret_variables,
      }),
      overrides: servicesFromYaml?.previews,
    });
  }, [latestProto, appEnv, servicesFromYaml]);

  const porterAppFormMethods = useForm<PorterAppFormData>({
    reValidateMode: "onSubmit",
    resolver: zodResolver(porterAppFormValidator),
    defaultValues: {
      app: withPreviewOverrides,
      source: latestSource,
      deletions: {
        serviceNames: [],
        envGroupNames: [],
        predeploy: [],
      },
    },
  });

  const { reset, handleSubmit } = porterAppFormMethods;

  const onSubmit = handleSubmit(async (data) => {
    try {
      setCreateError("");

      const proto = clientAppToProto(data);
      setValidatedAppProto(proto);

      const { env } = data.app;
      const variables = env
        .filter((e) => !e.hidden && !e.deleted)
        .reduce((acc: Record<string, string>, item) => {
          acc[item.key] = item.value;
          return acc;
        }, {});
      const secrets = env
        .filter((e) => !e.deleted)
        .reduce((acc: Record<string, string>, item) => {
          if (item.hidden) {
            acc[item.key] = item.value;
          }
          return acc;
        }, {});
      setFinalizedAppEnv({ variables, secrets });

      setShowGHAModal(true);
    } catch (err) {
      if (axios.isAxiosError(err) && err.response?.data?.error) {
        setCreateError(err.response?.data?.error);
        return;
      }
      setCreateError(
        "An error occurred while validating your application. Please try again."
      );
    }
  });

  const createTemplateAndWorkflow = useCallback(
    async ({
      app,
      variables,
      secrets,
    }: {
      app: PorterApp | null;
      variables: Record<string, string>;
      secrets: Record<string, string>;
    }) => {
      try {
        if (!app) {
          return false;
        }

        await api.createAppTemplate(
          "<token>",
          {
            b64_app_proto: btoa(app.toJsonString()),
            variables,
            secrets,
          },
          {
            project_id: projectId,
            cluster_id: clusterId,
            porter_app_name: porterApp.name,
          }
        );

        return true;
      } catch (err) {
        if (axios.isAxiosError(err) && err.response?.data?.error) {
          setCreateError(err.response?.data?.error);
          return false;
        }

        setCreateError(
          "An error occurred while creating the CI workflow. Please try again."
        );
        return false;
      }
    },
    []
  );

  useEffect(() => {
    reset({
      app: withPreviewOverrides,
      source: latestSource,
      deletions: {
        serviceNames: [],
        envGroupNames: [],
        predeploy: [],
      },
    });
  }, [withPreviewOverrides, latestSource]);

  if (latestSource.type !== "github") {
    return <Redirect to={`/apps/${porterApp.name}`} />;
  }

  return (
    <FormProvider {...porterAppFormMethods}>
      <form onSubmit={onSubmit}>
        <VerticalSteps
          currentStep={3}
          steps={[
            <>
              <Text size={16}>Application services</Text>
              <Spacer y={0.5} />
              <ServiceList
                addNewText={"Add a new service"}
                fieldArrayName={"app.services"}
              />
            </>,
            <>
              <Text size={16}>Environment variables (optional)</Text>
              <Spacer y={0.5} />
              <Text color="helper">
                Specify environment variables shared among all services.
              </Text>
              <EnvSettings baseEnvGroups={baseEnvGroups} />
            </>,
            <>
              <Text size={16}>Pre-deploy job (optional)</Text>
              <Spacer y={0.5} />
              <Text color="helper">
                You may add a pre-deploy job to perform an operation before your
                application services deploy each time, like a database
                migration.
              </Text>
              <Spacer y={0.5} />
              <ServiceList
                addNewText={"Add a new pre-deploy job"}
                prePopulateService={deserializeService({
                  service: defaultSerialized({
                    name: "pre-deploy",
                    type: "predeploy",
                  }),
                })}
                existingServiceNames={
                  latestProto.predeploy ? ["pre-deploy"] : []
                }
                isPredeploy
                fieldArrayName={"app.predeploy"}
              />
            </>,
            <Button type="submit" loadingText={"Deploying..."} width={"150px"}>
              Enable Previews
            </Button>,
          ].filter((x) => x)}
        />
      </form>
      {showGHAModal && (
        <GithubActionModal
          type="preview"
          closeModal={() => setShowGHAModal(false)}
          githubAppInstallationID={latestSource.git_repo_id}
          githubRepoOwner={latestSource.git_repo_name.split("/")[0]}
          githubRepoName={latestSource.git_repo_name.split("/")[1]}
          branch={latestSource.git_branch}
          stackName={porterApp.name}
          projectId={projectId}
          clusterId={clusterId}
          deployPorterApp={() =>
            createTemplateAndWorkflow({
              app: validatedAppProto,
              variables,
              secrets,
            })
          }
          deploymentError={createError}
          porterYamlPath={latestSource.porter_yaml_path}
        />
      )}
    </FormProvider>
  );
};

export default AppTemplateForm;

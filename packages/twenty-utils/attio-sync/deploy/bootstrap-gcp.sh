#!/usr/bin/env bash
set -euo pipefail
project=ontora-twenty-crm-prod
zone=europe-west3-a
instance=crm-prod
account="attio-deployer@$project.iam.gserviceaccount.com"
project_number=$(gcloud projects describe "$project" --format='value(projectNumber)')
vm_account=$(gcloud compute instances describe "$instance" --project "$project" --zone "$zone" --format='value(serviceAccounts[0].email)')
vm_address=$(gcloud compute instances describe "$instance" --project "$project" --zone "$zone" --format='value(networkInterfaces[0].networkIP)')
gcloud services enable iam.googleapis.com iamcredentials.googleapis.com sts.googleapis.com iap.googleapis.com --project "$project" --quiet
if ! gcloud iam service-accounts describe "$account" --project "$project" >/dev/null 2>&1; then
  gcloud iam service-accounts create attio-deployer --display-name='Attio connector GitHub deployment' --project "$project"
fi
if ! gcloud iam workload-identity-pools describe attio-github --location global --project "$project" >/dev/null 2>&1; then
  gcloud iam workload-identity-pools create attio-github --location global --project "$project" --display-name='Attio GitHub deploy'
fi
condition="assertion.repository_id == '1453308566' && assertion.repository_owner_id == '264996644' && assertion.ref == 'refs/heads/main' && assertion.sub == 'repo:ontora-main/twenty-crm:environment:attio-production' && assertion.workflow_ref == 'ontora-main/twenty-crm/.github/workflows/cd-attio-sync.yaml@refs/heads/main'"
provider_arguments=(--location global --project "$project" --workload-identity-pool attio-github --issuer-uri https://token.actions.githubusercontent.com --attribute-mapping 'google.subject=assertion.sub,attribute.repository_id=assertion.repository_id' --attribute-condition "$condition")
if gcloud iam workload-identity-pools providers describe github --workload-identity-pool attio-github --location global --project "$project" >/dev/null 2>&1; then
  gcloud iam workload-identity-pools providers update-oidc github "${provider_arguments[@]}"
else
  gcloud iam workload-identity-pools providers create-oidc github "${provider_arguments[@]}"
fi
gcloud iam service-accounts add-iam-policy-binding "$account" --project "$project" --role roles/iam.workloadIdentityUser --member "principalSet://iam.googleapis.com/projects/$project_number/locations/global/workloadIdentityPools/attio-github/attribute.repository_id/1453308566" --quiet >/dev/null
for specification in 'attioDeployRead:compute.projects.get,compute.instances.get,compute.zoneOperations.get' 'attioDeployInstance:compute.instances.setMetadata'; do
  role=${specification%%:*}
  permissions=${specification#*:}
  if gcloud iam roles describe "$role" --project "$project" >/dev/null 2>&1; then
    gcloud iam roles update "$role" --project "$project" --permissions "$permissions" --stage GA --quiet >/dev/null
  else
    gcloud iam roles create "$role" --project "$project" --title "$role" --permissions "$permissions" --stage GA --quiet >/dev/null
  fi
done
gcloud projects add-iam-policy-binding "$project" --member "serviceAccount:$account" --role "projects/$project/roles/attioDeployRead" --condition=None --quiet >/dev/null
gcloud projects add-iam-policy-binding "$project" --member "serviceAccount:$account" --role "projects/$project/roles/attioDeployInstance" --condition "expression=resource.type == 'compute.googleapis.com/Instance' && resource.name.endsWith('/zones/$zone/instances/$instance'),title=attio-crm-instance-only" --quiet >/dev/null
gcloud projects add-iam-policy-binding "$project" --member "serviceAccount:$account" --role roles/iap.tunnelResourceAccessor --condition "expression=destination.port == 22 && destination.ip == '$vm_address',title=attio-crm-ssh-only" --quiet >/dev/null
gcloud iam service-accounts add-iam-policy-binding "$vm_account" --project "$project" --member "serviceAccount:$account" --role roles/iam.serviceAccountUser --quiet >/dev/null
printf '\nATTIO_GCP_WIF_PROVIDER=projects/%s/locations/global/workloadIdentityPools/attio-github/providers/github\nATTIO_GCP_DEPLOY_ACCOUNT=%s\n' "$project_number" "$account"

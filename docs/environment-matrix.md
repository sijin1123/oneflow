# OneFlow environment matrix

| Item | Development | Production |
|---|---|---|
| Domain | `dev-oneflow.nexvione.net` | `oneflow.nexvione.net` |
| Environment | `staging` | `production` |
| Authentication | Google OIDC, `bsgone.com` | Google OIDC, `bsgone.com` |
| Tunnel origin | `127.0.0.1:5174` | `127.0.0.1:5173` |
| API listener | `127.0.0.1:8001` | `127.0.0.1:8000` |
| Release root | `/opt/oneflow/dev/releases` | `/opt/oneflow/prod/releases` |
| Current release | `/opt/oneflow/dev/current` | `/opt/oneflow/prod/current` |
| Runtime env | `/etc/oneflow/dev.env` | `/etc/oneflow/prod.env` |
| Database env | `/etc/oneflow/dev.database.env` | `/etc/oneflow/prod.database.env` |
| Database | `oneflow_dev` | `oneflow_prod` |
| Database role | `oneflow_dev_app` | `oneflow_prod_app` |
| Uploads | `/srv/oneflow/dev/uploads` | `/srv/oneflow/prod/uploads` |
| API service | `oneflow-api@dev` | `oneflow-api@prod` |
| Upload limit | 50 MiB/file | 50 MiB/file |
| Project quota | 20 GiB | 20 GiB |
| Deployment source | manual `dev` or `both` | successful dev gate or manual `prod` |

Database passwords are generated on the server and are not recorded in this document. The Google
OAuth secret must be rotated after any disclosure and entered directly on the server.

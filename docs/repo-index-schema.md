# Repository Index — Field Schema Reference

A two-layer schema for indexing ~300 repositories into a queryable knowledge layer.

- **Layer 1 (Core Context Record)** — stable identity, ownership, and classification. Sourced from the application inventory, CMDB, and git host. One record per repo, keyed to `app_id`.
- **Layer 2 (Extracted & Derived Fields)** — everything the extractors compute from the code, manifests, CI, and runtime environment. Refreshed on a schedule.

Design rules:

- `app_id` is the primary key. An application may map to many repos; model `app → [repos]`, never assume 1:1.
- Keep raw extraction output alongside derived fields so every number is auditable.
- Version the schema from day one. Fields will be added, and someone will eventually ask what a metric looked like last quarter.
- Record the source of truth per field (CMDB vs. git vs. inferred) so disputes are settled in seconds.

---

## Layer 1 — Core Context Record

### Identity

| Field | Type | Notes |
|---|---|---|
| `app_id` | string | Corporate application ID. Join key to CMDB, risk register, cost centers |
| `app_name` | string | Human name as it appears in the inventory |
| `repo_name` | string | |
| `repo_org` | string | GitHub/GHE org or project |
| `repo_url` | string | |
| `default_branch` | string | |
| `repo_type` | enum | service, ui, library, batch/job, infra, docs, mobile |
| `app_to_repo_map` | list | Repos belonging to this app. Many questions are asked at app level, not repo level |

### Ownership

| Field | Type | Notes |
|---|---|---|
| `owning_team` | string | |
| `product_owner` | string | |
| `tech_lead` | string | |
| `distribution_list` | string | Team DL or channel |
| `cost_center` | string | |
| `portfolio` | string | |
| `line_of_business` | string | e.g. fleet ops, telematics |
| `on_call_rotation` | string | Support queue or rotation name |
| `primary_contributors` | list | Derived from git, last 12 months. Use when the official owner field is stale |

### Classification

| Field | Type | Notes |
|---|---|---|
| `business_criticality` | enum | Tier 1/2/3 per CMDB |
| `data_classification` | enum | PII, PCI, internal, public |
| `customer_facing` | bool | |
| `internet_exposed` | bool | |
| `regulatory_scope` | list | SOX, CPNI, GDPR/CCPA, etc. |
| `lifecycle_status` | enum | active, maintenance, sunset, decommissioned |
| `strategic_disposition` | enum | invest, sustain, migrate, retire (TIME-style bucket) |

### Deployment

| Field | Type | Notes |
|---|---|---|
| `environments` | list | dev / test / prod |
| `hosting` | enum | on-prem VM, private cloud, Azure, AWS, Kubernetes, other |
| `deploy_mechanism` | string | Pipeline name, manual, scheduled |
| `prod_url` | string | |
| `endpoints` | list | |
| `health_check_url` | string | |

### Record Metadata

| Field | Type | Notes |
|---|---|---|
| `last_indexed_at` | timestamp | |
| `index_version` | string | Schema version used for this record |
| `source_of_truth_per_field` | map | Field → origin (CMDB / git / inferred) |
| `confidence` | map | Flags fields populated by inference |

### Summary

| Field | Type | Notes |
|---|---|---|
| `one_line_purpose` | string | ~20 words. This is what goes in the always-loaded catalog |
| `description` | string | 1–2 paragraphs, generated from README + structure |
| `tags` | list | Free-form, for search |

---

## Layer 2 — Extracted & Derived Fields

### Stack

| Field | Notes |
|---|---|
| `languages` | With LOC and percentage |
| `runtime` / `runtime_version` | JDK, Node, .NET target framework, Python |
| `frameworks` | Spring Boot, Angular, Knockout, ASP.NET, Express — with major versions |
| `build_tool` | Maven, Gradle, npm, MSBuild |
| `package_manager` | |
| `database_engines` | |
| `db_drivers` | |
| `orm` | Hibernate, Entity Framework, Sequelize |
| `messaging` | Kafka, MQ, RabbitMQ |
| `caching` | Redis, in-process |
| `ui_type` | SPA, server-rendered, none |
| `containerized` | Dockerfile present |
| `orchestrated` | Helm / K8s manifests present |

### Dependencies

| Field | Notes |
|---|---|
| `direct_dependencies` | Name + version |
| `transitive_dependencies` | Full tree, or at minimum a count |
| `internal_libraries_consumed` | The fleet-wide blast radius map |
| `internal_services_called` | Config/URL references resolving to other indexed apps |
| `consumed_by` | Reverse edge — computed across the index |
| `third_party_apis` | External SaaS and APIs |
| `license_types` | GPL in a proprietary product will eventually be a legal question |

### Security

| Field | Notes |
|---|---|
| `open_cves` | By severity, with affected package and fix version |
| `eol_runtime` | Bool + months past end of life |
| `eol_framework` | Bool + months past end of life |
| `auth_mechanism` | SSO/OAuth, basic, API key, none detected |
| `secrets_detected` | Count and location — never the values |
| `hardcoded_connection_strings` | Also IPs and credential patterns |
| `dependency_scanning_enabled` | Dependabot, Snyk, etc. |
| `sast_present` | Sonar project ID |
| `last_scan_date` | |
| `quality_gate_status` | |
| `sonar_findings_by_severity` | |
| `security_hotspots` | |
| `injection_prone_patterns` | Raw SQL string building, eval, dynamic exec |
| `tls_anomalies` | Disabled cert verification is a common find |
| `sensitive_field_logging` | |

### Quality & Hygiene

| Field | Notes |
|---|---|
| `tests_present` | |
| `test_file_ratio` | |
| `coverage_pct` | Where reported |
| `ci_config_present` | |
| `last_successful_build` | |
| `lint_config_present` | |
| `readme_quality_score` | Exists / has setup steps / has architecture notes |
| `doc_freshness` | README last touched vs. code last touched |
| `code_duplication_pct` | |
| `complexity_metrics` | From Sonar or tree-sitter |
| `largest_files` | God-class detection |

### Activity & People

| Field | Notes |
|---|---|
| `last_commit_date` | |
| `commits_30d` / `commits_90d` / `commits_365d` | |
| `active_contributors_12m` | |
| `total_contributors` | |
| `bus_factor` | Contributors accounting for 80% of recent commits |
| `open_prs` / `pr_age` / `merge_frequency` | |
| `branch_count` / `stale_branch_count` | |
| `departed_contributors` | Cross-reference with HR/AD if permitted. Flags orphaned knowledge |

### Operations

| Field | Notes |
|---|---|
| `deploy_frequency` | |
| `last_deploy_date` | |
| `incident_count_12m` | From ServiceNow / Jira |
| `mttr` | |
| `monitoring_present` | Splunk, AppDynamics config detected |
| `config_management` | Env vars vs. hardcoded |
| `feature_flags` | |
| `batch_schedules` | |

### Data

| Field | Notes |
|---|---|
| `tables_read` / `tables_written` | From schema introspection |
| `schemas_touched` | |
| `shared_tables` | Blast radius at the data layer |
| `pii_fields_touched` | Column-name heuristics plus classification tagging |
| `external_data_feeds_in` / `_out` | |

### Cost & Footprint

Worth adding in a later phase — leadership asks about this constantly.

| Field | Notes |
|---|---|
| `hosting_cost_allocation` | |
| `license_costs` | Oracle, commercial libraries |
| `instance_count` | |
| `resource_sizing` | |
| `storage_growth` | |

---

## Leadership Questions → Fields That Answer Them

| Question | Fields used |
|---|---|
| What's our exposure to CVE X / library Y? | `direct_dependencies`, `internal_libraries_consumed`, `business_criticality` |
| How many apps are on unsupported tech? | `eol_runtime`, `eol_framework`, `runtime_version`, `business_criticality` |
| What would it take to get off Java 8 / Knockout / .NET Framework? | stack clusters, `languages` LOC, `consumed_by`, `coverage_pct` |
| Which apps have nobody who knows them? | `bus_factor`, `departed_contributors`, `last_commit_date` |
| If we lose vendor/library Z, what breaks? | dependency graph, `internal_services_called`, `consumed_by` |
| Which apps touch customer PII and are internet-exposed? | `data_classification`, `pii_fields_touched`, `internet_exposed` |
| Where are we not scanning? | `sast_present`, `dependency_scanning_enabled`, `last_scan_date` |
| What's our stack diversity, and where should we standardize? | stack cluster counts across `frameworks` + `runtime` |
| What's safe to decommission? | `last_deploy_date`, `commits_365d`, `consumed_by` (empty), `incident_count_12m` |
| How healthy is portfolio P vs. Q? | roll-up of all metrics by `portfolio` / `line_of_business` |
| What's the blast radius of changing shared library L or table T? | `consumed_by`, `shared_tables` |
| Where is documentation missing for audit? | `readme_quality_score`, `doc_freshness`, `regulatory_scope` |
| Which apps are riskiest overall? | composite score (below) |

---

## Composite Risk Score

Build this explicitly. It's the number that ends up on a slide, and having the breakdown one click away is what makes the tool credible when it's challenged.

**Score 0–100 per app, with contributing factors always visible:**

```
risk = f(
  business_criticality,      # weight up tier 1
  internet_exposed,          # multiplier
  data_classification,       # PII/PCI multiplier
  eol_runtime + eol_framework,
  open_cves (severity-weighted),
  hygiene_gaps (no tests / no CI / no scanning),
  bus_factor,
  last_commit_date staleness,
  incident_count_12m
)
```

Requirements:

- Every input factor is displayed alongside the score — never a black-box number.
- The score is reproducible from stored raw extraction data.
- Score history is retained so trend ("we cut tier-1 EOL exposure 40% this year") is available without recomputation.

---

## Implementation Notes

- **Refresh cadence:** Layer 1 weekly from CMDB/git; Layer 2 nightly for cheap fields, weekly for full dependency resolution and CVE joins.
- **CVE source:** OSV, GitHub Advisory DB, or NVD, joined against resolved dependency versions.
- **Catalog file:** one line per repo (`app_id`, `repo_name`, `one_line_purpose`, tags) — small enough to always load into context (~5k tokens). Full records fetched on demand.
- **Query surface:** expose as tools — `search_repos(query)`, `get_repo(app_id)`, `find_dependents(name)`, `apps_by_stack(filter)`, `risk_report(portfolio)`.
- **Snapshots:** persist a dated snapshot of the full index on each full run. Quarter-over-quarter comparison is a leadership question you will be asked.

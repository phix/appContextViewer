# Catalog schema v1

The contract a producer must emit and the viewer loads. Machine-readable form: [`schema/catalog.v1.schema.json`](../schema/catalog.v1.schema.json). Worked example: [`samples/catalog.example.json`](../samples/catalog.example.json). Vocabulary: [`CONTEXT.md`](../CONTEXT.md).

## Shape

```jsonc
{
  "schemaVersion": 1,            // required, integer, major version only
  "generatedAt": "…",            // optional RFC 3339
  "source": "…",                 // optional, display only
  "applications": [ … ],         // required, may be empty
  "externals": [ … ]             // optional, default []
}
```

## Application

| key | required | meaning |
|---|---|---|
| `repository` | yes | Repository name. May contain `/` (e.g. `org/repo`). No whitespace, no leading or trailing `/`. |
| `project` | yes | Name within the Repository. No `/`, no whitespace. |
| `kind` | no | Open string. Conventions: `service`, `library`, `pipeline`, `mobile-app`, `web-app`, `job`. |
| `team` | no | The one Team that owns it. Implicit: naming a Team creates it. |
| `description`, `url` | no | Display only. |
| `dependsOn` | no | Runtime Dependencies. Array of refs, see below. |
| `publishes`, `subscribes` | no | Arrays of Channel names. Implicit: naming a Channel creates it. |
| `attributes` | no | Free-form object. Scalar values can drive grouping, coloring and filtering. |

No other keys are allowed at the Application level. Custom data goes in `attributes`, so future reserved keys can never collide with producer fields.

## Identity and references

- An Application's **id** is `repository + "/" + project`, for example `acme/platform-core/auth-service`.
- Ids split at the **last** slash. That is why `project` may not contain one.
- Ids are compared **exactly** (case-sensitive, no trimming).
- A ref in `dependsOn` is either an Application id or `external:<id>` naming a declared External.
- Bare project names are not refs. There is no same-repository shorthand.

## External

| key | required | meaning |
|---|---|---|
| `id` | yes | Unique within the Catalog. No `/`, no whitespace. Referenced as `external:<id>`. |
| `kind` | yes | Open string. Conventions: `database`, `cache`, `queue`, `storage`, `saas`, `identity`, `network`, `other`. |
| `name`, `description`, `url`, `attributes` | no | As for Applications. |

## Rules the viewer enforces beyond the JSON Schema

Errors stop the load. Warnings are listed but the Catalog still loads.

| code | level | rule |
|---|---|---|
| `E_SCHEMA_VERSION` | error | `schemaVersion` missing or not a supported major. |
| `E_INVALID` | error | JSON Schema violation on a required or reserved key (wrong type, bad pattern, missing `repository`/`project`). |
| `E_DUPLICATE_APPLICATION` | error | Two Applications derive the same id. |
| `E_DUPLICATE_EXTERNAL` | error | Two Externals share an `id`. |
| `E_UNRESOLVED_REF` | error | A `dependsOn` entry names no Application and no declared External. Never silently becomes a node. |
| `E_SELF_DEPENDENCY` | error | An Application lists its own id in `dependsOn`. |
| `W_UNKNOWN_KEY` | warning | A key outside `attributes` that the schema does not define. The producer should fix it; the viewer ignores it. |
| `W_EMPTY_CHANNEL` | warning | A Channel with publishers but no subscribers, or the reverse. Informational. |

Dependency cycles are **allowed** and are not a warning; the viewer must handle them.

## Semantics

- `dependsOn` is a **Dependency**: the Application needs the target at runtime. Direction is always from the declaring Application to the target. Dependents are derived by the viewer, never declared.
- `publishes` and `subscribes` are **Flows** through a Channel. A Flow is not a Dependency and never contributes to a Blast radius.
- `team` is **Ownership**. Grouping by Team reads this key; grouping by anything else reads `attributes`.
- Any cataloged unit is an Application, including libraries nothing calls at runtime; `kind` describes it.

## Versioning

- `schemaVersion` is an integer major. v1 readers refuse any other value with `E_SCHEMA_VERSION`.
- Additive changes (new optional keys, new `kind` conventions) stay in v1. Changing the meaning or shape of an existing key bumps the major.
- Producers validating with the JSON Schema get strict rejection of unknown keys. The viewer downgrades that specific violation to `W_UNKNOWN_KEY` so a slightly ahead producer still loads.

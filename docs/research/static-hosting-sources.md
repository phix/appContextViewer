# Static hosting for the appContextViewer (Vite + TypeScript SPA) — primary-source research

Researched 2026-09-02 for the public repo `github.com/phix/appContextViewer` (GitHub API: owner `phix` is a **User** account, repo `private: false`, default branch `main`).

**Method.** Every claim below is tied to a URL. Where the source has a sentence, it is quoted verbatim in `> "..."` form. Sources are official docs only (vite.dev, docs.github.com, github.com/actions, vercel.com/docs and vercel.com/pricing, MDN, Chromium source at chromium.googlesource.com, docs.aws.amazon.com, developers.google.com, learn.microsoft.com, help.dropbox.com, the plugin's own README and the npm registry). A few facts that the docs do not state were checked empirically with `curl` on 2026-09-02; those are labelled **OBSERVED** and are evidence of current behaviour, not documentation. Anything that could not be tied to a primary source is in the final **Unverified** list.

---

## Comparison table — GitHub Pages vs Vercel (static Vite build, no functions)

| Dimension | GitHub Pages (project site `phix.github.io/appContextViewer`) | Vercel (Hobby, Vite preset) |
| --- | --- | --- |
| **Deploy mechanics** | Actions workflow: build → `actions/upload-pages-artifact` (gzip tar of `dist`) → `actions/deploy-pages` into the `github-pages` environment; Pages source must be set to "GitHub Actions". Vite ships the exact workflow (§A1). | Git import or `vercel` CLI; framework auto-detected: "Vercel will detect that you are using Vite and will enable the correct settings" (vite.dev). Only the Output Directory is served statically; Vite has "Static Assets ✓, SSR N/A" in Vercel's matrix. SPA deep links need a `rewrites` entry in `vercel.json` (§B1). |
| **`base` for Vite** | Project page → `base: '/appContextViewer/'`; custom domain or user page → `'/'` (§A1). | Site served at domain root → default `'/'` (nothing to set). |
| **Custom domain** | Settings → Pages → Custom domain; CNAME record → `<user>.github.io` for subdomains, 4 A records for apex. With a custom Actions workflow "no `CNAME` file is created, and any existing `CNAME` file is ignored" (§A2). | Project Settings → Domains; A record for apex, per-project CNAME for subdomains; Hobby: 50 domains per project (§B2). |
| **HTTPS** | `github.io` sites "are served over HTTPS automatically"; custom domains get Let's Encrypt certs and an opt-in **Enforce HTTPS** checkbox (§A2). | "Vercel will automatically try to generate a certificate for every domain once it is added"; Let's Encrypt; custom certs Enterprise-only (§B2). |
| **Limits** | Site ≤ 1 GB; soft 100 GB/month bandwidth; soft 10 builds/hour; deploy times out at 10 min; Actions minutes free for public repos (§A3). | Hobby: 100 GB/month Fast Data Transfer, 1M Edge Requests/month, 100 deployments/day, 100 builds/hour, 1 concurrent build, 45 min max build, 100 MB CLI source upload, 15,000 source files; exceeding limits pauses the feature for ~30 days (§B1). |
| **Custom response headers (CSP / COOP / COEP / CORS)** | **No documented mechanism on github.com Pages**; the header feature exists only in GitHub Enterprise Server's Management Console (§A4). OBSERVED: real Pages sites return `access-control-allow-origin: *` and no CSP/COOP/COEP. → Web Workers fine (same-origin scripts); `SharedArrayBuffer`/cross-origin isolation not possible. | Yes — `headers` in `vercel.json` / `vercel.ts` "for static files, Vercel functions, and a wildcard that matches all routes" (§B4). |
| **Private gating** | None on github.com (the visibility feature is Enterprise Cloud). | Hobby: **Vercel Authentication, Standard Protection only** — "your production domain remains publicly accessible"; protecting production ("All Deployments") needs Pro/Enterprise; Password Protection = Pro add-on "Advanced Deployment Protection" $150/month or Enterprise (§B3). |
| **Cost** | Free: "GitHub Pages is available in public repositories with GitHub Free". Not for commercial use (§A3). | Hobby "$0/mo." but "restricts users to non-commercial, personal use only"; Pro $20/seat/month; +$150/month for Advanced Deployment Protection (§B1, §B3). Note: Hobby cannot connect to Git-organization repos — irrelevant here because `phix` is a User. |

---

## A. GitHub Pages for a Vite static build

### A1. Deploy mechanics and `base`

**Vite — "Deploying a Static Site"** — https://vite.dev/guide/static-deploy (GitHub Pages section; text confirmed against `docs/guide/static-deploy.md` in the vitejs/vite repo):

> "By default, the build output will be placed at `dist`. You may deploy this `dist` folder to any of your preferred platforms."

> "The `vite preview` command will boot up a local static web server that serves the files from `dist` at `http://localhost:4173`. It's an easy way to check if the production build looks OK in your local environment."

> "If you are deploying to `https://<USERNAME>.github.io/`, or to a custom domain through GitHub Pages (eg. `www.example.com`), set `base` to `'/'`. Alternatively, you can remove `base` from the configuration, as it defaults to `'/'`."

> "If you are deploying to `https://<USERNAME>.github.io/<REPO>/` (eg. your repository is at `https://github.com/<USERNAME>/<REPO>`), then set `base` to `'/<REPO>/'`."

→ For `https://phix.github.io/appContextViewer/` the config is `base: '/appContextViewer/'`; if a custom domain is attached, `base: '/'` (or omit).

> "In your repository, go to **Settings → Pages**. Under **Build and deployment**, open the **Source** dropdown, and select **GitHub Actions**."

> "GitHub will now deploy your site using a GitHub Actions workflow, which is necessary since Vite requires a build step for deployment."

The workflow Vite ships (verbatim from https://github.com/vitejs/vite/blob/main/docs/guide/static-deploy-github-pages.yaml, which the guide includes):

```yaml
# Simple workflow for deploying static content to GitHub Pages
name: Deploy static content to Pages

on:
  # Runs on pushes targeting the default branch
  push:
    branches: ['main']

  # Allows you to run this workflow manually from the Actions tab
  workflow_dispatch:

# Sets the GITHUB_TOKEN permissions to allow deployment to GitHub Pages
permissions:
  contents: read
  pages: write
  id-token: write

# Allow one concurrent deployment
concurrency:
  group: 'pages'
  cancel-in-progress: true

jobs:
  # Single deploy job since we're just deploying
  deploy:
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    runs-on: ubuntu-latest
    steps:
      - name: Checkout
        uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7
      - name: Set up Node
        uses: actions/setup-node@820762786026740c76f36085b0efc47a31fe5020 # v7
        with:
          node-version: lts/*
          cache: 'npm'
      - name: Install dependencies
        run: npm ci
      - name: Build
        run: npm run build
      - name: Setup Pages
        uses: actions/configure-pages@45bfe0192ca1faeb007ade9deae92b16b8254a0d # v6
      - name: Upload artifact
        uses: actions/upload-pages-artifact@fc324d3547104276b827a68afc52ff2a11cc49c9 # v5
        with:
          # Upload dist folder
          path: './dist'
      - name: Deploy to GitHub Pages
        id: deployment
        uses: actions/deploy-pages@cd2ce8fcbc39b97be8ca5fce6e763baed58fa128 # v5
```

**Vite `base` option** — https://vite.dev/config/shared-options#base:

> "Base public path when served in development or production. Valid values include:
> - Absolute URL pathname, e.g. `/foo/`
> - Full URL, e.g. `https://bar.com/foo/` (The origin part won't be used in development so the value is the same as `/foo/`)
> - Empty string or `./` (for embedded deployment)"

**Vite "Public Base Path"** — https://vite.dev/guide/build#public-base-path:

> "If you are deploying your project under a nested public path, simply specify the `base` config option and all asset paths will be rewritten accordingly. This option can also be specified as a command line flag, e.g. `vite build --base=/my/public/path/`."

> "JS-imported asset URLs, CSS `url()` references, and asset references in your `.html` files are all automatically adjusted to respect this option during build."

**GitHub — "Using custom workflows with GitHub Pages"** — https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages:

> "The GitHub Pages artifact should be a compressed `gzip` archive containing a single `tar` file. The `tar` file must be under 10GB in size and should not contain any symbolic or hard links."

> "The default environment is `github-pages`."

The `deploy-pages` job needs `pages: write` and `id-token: write` permissions (same page).

**GitHub — "Configuring a publishing source"** — https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site:

> "If you want to use a build process other than Jekyll or you do not want a dedicated branch to hold your compiled static files, we recommend that you write a GitHub Actions workflow to publish your site."

**`actions/deploy-pages` README** — https://github.com/actions/deploy-pages:

> "This action is used to deploy Actions artifacts to GitHub Pages."

Required permissions block quoted from the README: `pages: write      # to deploy to Pages` and `id-token: write   # to verify the deployment originates from an appropriate source`. Inputs: `artifact_name` (default `github-pages`), `timeout` (default `600000` ms), `error_count` (`10`), `reporting_interval` (`5000`), `preview` (`false`, alpha). License: MIT. Current major: v4 (v3 requires GHES 3.9+).

**GitHub — site types / default URL** — https://docs.github.com/en/pages/getting-started-with-github-pages/what-is-github-pages: project sites are published at `http(s)://<owner>.github.io/<repositoryname>` (table "Types of GitHub Pages sites").

### A2. Custom domain + HTTPS

**GitHub — "Managing a custom domain"** — https://docs.github.com/en/pages/configuring-a-custom-domain-for-your-github-pages-site/managing-a-custom-domain-for-your-github-pages-site:

> "Under 'Custom domain', type your custom domain, then click **Save**."

> "If you are publishing your site from a branch, this will create a commit that adds a `CNAME` file directly to the root of your source branch."

> "If you are publishing from a custom GitHub Actions workflow, no `CNAME` file is created, and any existing `CNAME` file is ignored."

> "Create a `CNAME` record that points your subdomain to the default domain for your site" (e.g. `<user>.github.io`).

Apex domains: A records to `185.199.108.153, 185.199.109.153, 185.199.110.153, 185.199.111.153` (or "To create an `ALIAS` or `ANAME` record, point your apex domain to the default domain for your site.").

> "We recommend verifying your custom domain prior to adding it to your repository, in order to improve security and avoid takeover attacks."

> "We strongly recommend that you do not use wildcard DNS records, such as `*.example.com`. These records put you at an immediate risk of domain takeovers."

**GitHub — "About custom domains"** — https://docs.github.com/en/pages/configuring-a-custom-domain-for-your-github-pages-site/about-custom-domains-and-github-pages (text from `github/docs` source):

> "By default, if you set a custom domain for a **user site** or **organization site**, that same custom domain will be used for all project sites owned by the same account."

> "For example, if the custom domain for your user site is `www.octocat.com`, and you have a project site with no custom domain configured that is published from a repository called `octo-project`, the GitHub Pages site for that repository will be available at `www.octocat.com/octo-project`."

> "We recommend always using a `www` subdomain, even if you also use an apex domain."

**GitHub — "Securing your GitHub Pages site with HTTPS"** — https://docs.github.com/en/pages/getting-started-with-github-pages/securing-your-github-pages-site-with-https:

> "All GitHub Pages sites, including sites that are correctly configured with a custom domain, support HTTPS and HTTPS enforcement."

> "GitHub Pages sites created after June 15, 2016, and using `github.io` domains are served over HTTPS automatically."

> "People with admin permissions for a repository can enforce HTTPS for a GitHub Pages site."

> "Under "GitHub Pages," select **Enforce HTTPS**." (the setting "transparently redirect all HTTP requests to HTTPS")

> "When you set or change your custom domain in the Pages settings, an automatic DNS check begins. This check determines if your DNS settings are configured to allow GitHub to obtain a certificate automatically. If the check is successful, GitHub queues a job to request a TLS certificate from Let's Encrypt."

> "RFC3280 states that the maximum length of the common name should be 64 characters. Therefore, the entire domain name of your GitHub Pages site must be less than 64 characters long for a certificate to be successfully created."

So: HTTPS is automatic on `github.io`; on a custom domain it is available and *enforced only if the checkbox is ticked*.

### A3. Limits, build time, cost

**GitHub — "GitHub Pages limits"** — https://docs.github.com/en/pages/getting-started-with-github-pages/github-pages-limits:

> "Published GitHub Pages sites may be no larger than 1 GB."

> "GitHub Pages source repositories have a recommended limit of 1 GB."

> "GitHub Pages deployments will timeout if they take longer than 10 minutes."

> "GitHub Pages sites have a *soft* bandwidth limit of 100 GB per month."

> "GitHub Pages sites have a *soft* limit of 10 builds per hour."

> "If your site exceeds these usage quotas, we may not be able to serve your site, or you may receive a polite email from GitHub Support suggesting strategies for reducing your site's impact on our servers."

> "GitHub Pages is not intended for or allowed to be used as a free web-hosting service to run your online business, e-commerce site, or any other website that is primarily directed at either facilitating commercial transactions or providing commercial software as a service (SaaS)."

**Plan / visibility** — https://docs.github.com/en/pages/getting-started-with-github-pages/what-is-github-pages (rendered from `data/reusables/gated-features/pages.md` in `github/docs`):

> "GitHub Pages is available in public repositories with GitHub Free and GitHub Free for organizations, and in public and private repositories with GitHub Pro, GitHub Team, GitHub Enterprise Cloud, and GitHub Enterprise Server."

**Actions minutes for the build** — https://docs.github.com/en/billing/managing-billing-for-your-products/about-billing-for-github-actions:

> "GitHub Actions usage is **free** for **self-hosted runners** and for **public repositories** that use standard GitHub-hosted runners."

(GitHub Free otherwise includes 2,000 minutes/month and 500 MB artifact storage for private repos — same page.) The `deploy-pages` action itself defaults to a 600,000 ms (10 min) timeout, matching the Pages deployment limit.

### A4. Custom HTTP headers (CSP, COOP/COEP) on GitHub Pages

**Documented:** there is no page on docs.github.com describing custom response headers for github.com-hosted Pages. The only header feature is for **GitHub Enterprise Server**, in the Management Console — https://docs.github.com/en/enterprise-server@3.17/admin/configuring-settings/configuring-user-applications-for-your-enterprise/configuring-github-pages-for-your-enterprise:

> "You can add or override response headers for GitHub Pages sites hosted by your GitHub Enterprise Server instance."

with the header name "limited to under 128 characters" and the value "limited to under 300 characters" (steps 4–5 on that page).

**OBSERVED (curl -sI, 2026-09-02)** — headers actually returned by GitHub-hosted Pages sites:

- `https://pages-themes.github.io/cayman/` (a project site): `server: GitHub.com`, `access-control-allow-origin: *`, `strict-transport-security: max-age=31556952`, `cache-control: max-age=600`. No `content-security-policy`, no `cross-origin-opener-policy`, no `cross-origin-embedder-policy`.
- `https://pages.github.com/` and `https://octocat.github.io/`: same shape (`access-control-allow-origin: *`, no CSP/COOP/COEP).
- 404 responses from `*.github.io` carry GitHub's own `content-security-policy: default-src 'none'; ...` — that is GitHub's error page, not something the site author controls.

**Consequences for the viewer, from MDN:**

- Web Workers: the worker script only needs to be same-origin with the page — https://developer.mozilla.org/en-US/docs/Web/API/Worker/Worker: the URL "must be same-origin with the caller's document, or a `blob:` or `data:` URL. The URL is resolved relative to the current HTML page's location." A Vite-built worker in `dist/assets/` is same-origin on Pages, so **Workers are unconstrained** by the header limitation.
- `SharedArrayBuffer` / cross-origin isolation is **not achievable** on Pages, because it needs response headers — https://developer.mozilla.org/en-US/docs/Web/API/Window/crossOriginIsolated:

> "A document will be cross-origin isolated if it is returned with an HTTP response that includes the headers:
> - `Cross-Origin-Opener-Policy` header with the directive `same-origin`.
> - `Cross-Origin-Embedder-Policy` header with the directive `require-corp` or `credentialless`."

> "Cross-origin isolated documents operate with fewer restrictions when using the following APIs: `SharedArrayBuffer` can be created and sent via a `Window.postMessage()` or a `MessagePort.postMessage()` call. `Performance.now()` offers better precision. ..."

- A CSP can still be expressed with a `<meta http-equiv="Content-Security-Policy">` tag in `index.html` (an HTML mechanism, not a header) — noted as an option; frame-ancestors/report-uri are header-only per the CSP spec (not researched further here).

---

## B. Vercel for a Vite static build

### B1. Deploy mechanics, Hobby eligibility, limits

**Vite guide (Vercel section)** — https://vite.dev/guide/static-deploy#vercel:

> "Vercel will detect that you are using Vite and will enable the correct settings for your deployment."

**Vercel — "Vite on Vercel"** — https://vercel.com/docs/frameworks/frontend/vite (last_updated 2026-08-26):

> "If your Vite app is configured to deploy as a Single Page Application (SPA), deep linking won't work out of the box."

> "To enable deep linking in SPA Vite apps, create a `vercel.json` file at the root of your project, and add the following code:"

```json
{
  "$schema": "https://openapi.vercel.sh/vercel.json",
  "rewrites": [
    {
      "source": "/(.*)",
      "destination": "/index.html"
    }
  ]
}
```

> "If `cleanUrls` is set to `true` in your project's `vercel.json`, do not include the file extension in the source or destination path. For example, `/index.html` would be `/`"

> "**Deploying your app in Multi-Page App mode is recommended for production builds**."

Functions/SSR sections of that page all say to add Nitro or a framework — i.e. a plain Vite build has no functions.

**Vercel — "Configuring a Build"** — https://vercel.com/docs/builds/configure-a-build:

> "In several use cases, Vercel automatically detects your project's framework and sets the best settings for you."

> "Vercel automatically configures the Build Command based on the framework. Depending on the framework, the Build Command can refer to the project's `package.json` file."

> "After building a project, most frameworks output the resulting build in a directory. Only the contents of this **Output Directory** will be served statically by Vercel."

> "If Vercel detects a framework, the output directory will automatically be configured."

**Vercel — "Frontends on Vercel" support matrix** — https://vercel.com/docs/frameworks/frontend: for **Vite**: Static Assets ✓, Edge Routing Rules ✓, Routing Middleware ✓, Server-Side Rendering **N/A**, ISR N/A, Image Optimization N/A. Vite is listed as a zero-configuration preset.

**Vercel — Hobby plan** — https://vercel.com/docs/plans/hobby (last_updated 2026-08-11):

> "The Hobby plan is **free** and aimed at developers with personal projects, and small-scale applications."

> "As stated in the fair use guidelines, the Hobby plan restricts users to non-commercial, personal use only."

> "As the Hobby plan is a free tier there are no billing cycles. In most cases, if you exceed your usage limits on the Hobby plan, you will have to wait until 30 days have passed before you can use the feature again."

Comparison table rows (Hobby | Pro): Projects 200 | Unlimited; Domains per project 50 | Unlimited; Deployments per day 100 | 6,000; Build vCPUs 2 | 4 (up to 30); Deployment Protection: "Vercel Authentication" | "Vercel Authentication, Password Protection (Add-on), Sharable Links"; Storage: Blob | Blob. Pro seats: "Developer seats cost **$20 per user / month**, while Viewer seats are free".

**Vercel pricing page** — https://vercel.com/pricing: Hobby "$0/mo."; Fast Data Transfer "100 GB / month included"; Edge Requests "1M / month included"; Pro "$20/mo." with "1TB / month included; then starting at $0.15 per GB" and "10M / month included; then starting at $2 per 1M"; the "Advanced Deployment Protection" row ("Secure your Vercel project's preview and production URLs.") is "Not available" on Hobby, "$150 / month" on Pro, "Included" on Enterprise.

**Vercel — Limits** — https://vercel.com/docs/limits (last_updated 2026-08-25). General limits table (Hobby | Pro): Deployments Created per Day 100 | 6000; Build Time per Deployment (Minutes) 45 | 45; Static File uploads 100 MB | 1 GB; Concurrent Deployments 1 | up to 500; Disk Size 32 GB. Verbatim:

> "The maximum duration of the Build Step is 45 minutes. When the limit is reached, the Build Step will be interrupted and the Deployment will fail."

> "When using the CLI to deploy, the maximum size of the source files that can be uploaded is limited to 100 MB for Hobby and 1 GB for Pro. If the size of the source files exceeds this limit, the deployment will fail."

> "The maximum number of files that can be uploaded when creating a CLI Deployment is `15,000` for source files."

> "Although there is no upper limit for output files created during a build, you can expect longer build times as a result of having many thousands of output files (100,000 or more, for example)."

> "You are able to build `100` Deployments every `3600` seconds (1 hour)." (Builds per hour, Hobby)

> "Using Next.js or any similar framework to build your deployment is classed as a build. Each Vercel Function is also classed as a build. Hosting static files such as an index.html file is not classed as a build."

> "Vercel does not support connecting a project on your Hobby team to Git repositories owned by Git organizations. You can either switch to an existing Team or create a new one." — not a blocker here (`phix` is a User account per the GitHub API).

**Vercel — Pricing (docs)** — https://vercel.com/docs/pricing: "Build usage is priced at $0.0035 per CPU Minute." and "Builds on Standard build machines are only billed when on-demand concurrency is enabled or Elastic build machines are selected." Hobby Functions allotment (irrelevant for a static build): "Active CPU 4 hours included", "Invocations 1 million included".

**Vercel — CDN usage** — https://vercel.com/docs/manage-cdn-usage: "When a user visits your site, the data transfer between Vercel's CDN and the user's device gets measured as Fast Data Transfer." and "CDN Requests appear as **Edge Requests** in your billing dashboard and usage charts."

### B2. Custom domain and HTTPS

**Vercel — "Adding & Configuring a Custom Domain"** — https://vercel.com/docs/domains/working-with-domains/add-a-domain:

> "Hobby teams have a limit of 50 custom domains per project."

> "If you're using an **Apex domain** (e.g. example.com), you will need to configure it with an **A** record"

> "If you're using a **Subdomain** (e.g. docs.example.com), you will need to configure it with a **CNAME** record"

> "You can configure **subdomains** with a **CNAME** record. Each project has a unique CNAME record e.g. `d1d4fc829fe7bc7c.vercel-dns-017.com`."

> "If you add an apex domain (e.g. `example.com`) to the project, Vercel will prompt you to add the `www` subdomain prefix."

**Vercel — "Working with SSL Certificates"** — https://vercel.com/docs/domains/working-with-ssl:

> "Vercel will automatically try to generate a certificate for every domain once it is added to a project, regardless of if it was registered through Vercel or not. However, it will only work once the certificate validation request is successful, which happens once DNS records are added and propagated."

> "Vercel uses LetsEncrypt for certificates. For all non-wildcard domains, we use the HTTP-01 challenge method"

> "Only Enterprise teams can configure custom SSL."

### B3. Deployment Protection / Vercel Authentication (gating the viewer privately later)

**Vercel — "Deployment Protection"** — https://vercel.com/docs/deployment-protection (last_updated 2026-08-21):

> "Deployment Protection lets you control who can access your preview and production URLs. You configure it at the project level, choosing both a **protection method** (how you protect) and a **protection scope** (what you protect)."

> "On the Hobby plan, Vercel Authentication with Standard Protection is available. This protects your preview deployments and deployment URLs, but your production domain remains publicly accessible. To protect production domains, you need a Pro or Enterprise plan."

> "Deployment Protection requires authentication for all requests, including those to Routing Middleware."

Methods and plan availability (verbatim list):

> "**Vercel Authentication**: Restricts access to only Vercel users with suitable access rights. **Available on all plans**"
> "**Passport**: Restricts access to visitors who authenticate through your identity provider. **Available on the Enterprise plan**"
> "**Password Protection**: Restricts access to users with the correct password. **Available on the Enterprise plan, or as a paid add-on for Pro plans**"
> "**Trusted IPs**: Restricts access to users with the correct IP address. **Available on the Enterprise plan**"

Scopes:

> "**Standard Protection**: Protects all deployments **except** production domains. **Available on all plans**"
> "**All Deployments**: Protects **all** URLs, including production domains. **Available on Pro and Enterprise plans**"

> "Advanced Deployment Protection features are available to Enterprise customers by default. Pro plan customers can access these features for an additional $150 per month: Password Protection; Private Production Deployments; Deployment Protection Exceptions"

> "When you enable Advanced Deployment Protection, you pay $150 per month for the add-on and gain access to *all* Advanced Deployment Protection features." and "You must have used the feature for **a minimum of 30 days** before you can disable it."

Same-origin fetches keep working behind protection (this is the CORS-free private-catalog path, see §D5):

> "For client-side requests, use relative paths in the fetch call to target the current domain. This automatically includes the user's authentication cookie for protected URLs"

**Vercel — Vercel Authentication** — https://vercel.com/docs/deployment-protection/methods-to-protect-deployments/vercel-authentication:

> "Vercel Authentication lets you restrict access to your public and non-public deployments. It is the **recommended** approach to protecting your deployments, and available on all plans. When enabled, it allows only users with deployment access to view and comment on your site."

> "Users attempting to access the deployment will encounter a Vercel login redirect. If already logged into Vercel, Vercel will authenticate them automatically."

Who can access: logged-in team members with at least a viewer role, project members with at least project Viewer, access-group members, "Logged in Vercel users who have been granted access", "Anyone who has been given a Shareable Link to the deployment", and "Tools using the protection bypass for automation header".

> "Those on the Hobby plan can only have one external user per account. If you need more, you can upgrade to a Pro plan."

API scope values: `prod_deployment_urls_and_all_previews` (Standard Protection), `all` (All Deployments), `preview` (Only Preview Deployments).

**Vercel — Password Protection** — https://vercel.com/docs/deployment-protection/methods-to-protect-deployments/password-protection:

> "Password Protection requires visitors to enter a pre-defined password before they can access your deployment. You can set the desired password from your project settings when enabling the feature, and update it any time."

> "Users only need to enter the password once per deployment, or when the password changes, due to cookie set by the feature being invalidated on password change"

**Vercel — Protection Bypass for Automation** — https://vercel.com/docs/deployment-protection/methods-to-bypass-deployment-protection/protection-bypass-automation: "you can authenticate using either an HTTP header or a query parameter named `x-vercel-protection-bypass` with the value of the generated secret for the project." (and `x-vercel-set-bypass-cookie: true` for in-browser sessions).

**Net for "host the viewer privately later":**
- Free (Hobby): only `*.vercel.app` preview/deployment URLs can be gated (Vercel login, team/granted users, one external user). The production domain cannot be gated.
- Pro ($20/seat/month) + Advanced Deployment Protection ($150/month): gate production with Vercel Authentication ("All Deployments") or Password Protection.
- Pro without the add-on: "All Deployments" scope is listed as "Available on Pro and Enterprise plans", while "Private Production Deployments" is listed under the $150 add-on — the docs are internally ambiguous on whether Pro alone can gate production with Vercel Authentication; see Unverified.

### B4. Custom headers via `vercel.json` / `vercel.ts`

**Vercel — `vercel.json` `headers`** — https://vercel.com/docs/project-configuration/vercel-json#headers:

> "**Type:** `Array` of header `Object`."

Example (verbatim excerpt):

```json
{
  "$schema": "https://openapi.vercel.sh/vercel.json",
  "headers": [
    {
      "source": "/service-worker.js",
      "headers": [{ "key": "Cache-Control", "value": "public, max-age=0, must-revalidate" }]
    },
    {
      "source": "/(.*)",
      "headers": [
        { "key": "X-Content-Type-Options", "value": "nosniff" },
        { "key": "X-Frame-Options", "value": "DENY" },
        { "key": "X-XSS-Protection", "value": "1; mode=block" }
      ]
    }
  ]
}
```

> "This example configures custom response headers for static files, Vercel functions, and a wildcard that matches all routes."

Object definition: `source` — "A pattern that matches each incoming pathname (excluding querystring)."; `headers` — "A non-empty array of key/value pairs representing each response header."; `has` / `missing` — optional conditional matching on presence/absence of header/cookie/query/host.

**Vercel — `vercel.ts`** — https://vercel.com/docs/project-configuration/vercel-ts:

> "The `vercel.ts` file lets you configure and override the default behavior of Vercel from within your project. Unlike `vercel.json`, which is static, `vercel.ts` executes at build time, which lets you dynamically generate configuration."

```ts
import { routes, type VercelConfig } from '@vercel/config/v1';

export const config: VercelConfig = {
  headers: [
    routes.header('/(.*)', [
      { key: 'X-Content-Type-Options', value: 'nosniff' },
      { key: 'X-Frame-Options', value: 'DENY' },
    ]),
  ],
};
```

Project Configuration overview — https://vercel.com/docs/project-configuration: "You can only use one configuration file per project." (`vercel.json`, `vercel.toml`, or `vercel.ts`).

**Vercel KB — "How to enable CORS on Vercel"** — https://vercel.com/kb/guide/how-to-enable-cors (Vercel-authored knowledge base, not a third-party blog):

> "The `vercel.json` layer supports only static values, so it can't validate an origin against an allowlist or switch behavior by environment."

> "Browsers send a preflight `OPTIONS` request before requests that use a method other than `GET`, `HEAD`, or `POST`, or that carry custom headers."

Under Deployment Protection "an unauthenticated preflight `OPTIONS` request gets a `401` from Vercel before your middleware or function runs" — the OPTIONS Allowlist feature exists for that case.

→ CSP, COOP/COEP (so `crossOriginIsolated === true` and `SharedArrayBuffer` become possible), and CORS headers can all be set on Vercel for static files; none can on GitHub Pages.

---

## C. Opening the built `index.html` from disk (`file://`)

### C1. Why `<script type="module">` fails on `file://`, the console error, Vite's answer, and `vite-plugin-singlefile`

**MDN — JavaScript modules guide** — https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Modules:

> "You need to pay attention to local testing — if you try to load the HTML file locally (i.e., with a `file://` URL), you'll run into CORS errors due to JavaScript module security requirements. You need to do your testing through a server."

**MDN — `<script>` element** — https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/script (`type="module"`):

> "Unlike classic scripts, module scripts require the use of the CORS protocol for cross-origin fetching."

**MDN — Same-origin policy, "File origins"** — https://developer.mozilla.org/en-US/docs/Web/Security/Same-origin_policy:

> "Modern browsers usually treat the origin of files loaded using the `file:///` scheme as *opaque origins*. What this means is that if a file includes other files from the same folder (say), they are not assumed to come from the same origin, and may trigger CORS errors."

> "Note that the URL specification states that the origin of files is implementation-dependent, and some browsers may treat files in the same directory or subdirectory as same-origin even though this has security implications."

**MDN — "Reason: CORS request not HTTP"** — https://developer.mozilla.org/en-US/docs/Web/HTTP/Guides/CORS/Errors/CORSRequestNotHttp:

> "CORS requests may only use the HTTP or HTTPS URL scheme, but the URL specified by the request is of a different type. This often occurs if the URL specifies a local file, using the `file:///` scheme."

> "Many browsers, including Firefox and Chrome, now treat all local files as having *opaque origins* (by default). As a result, loading a local file with included local resources will now result in CORS errors."

> "Developers who need to perform local testing should now set up a local server. As all files are served from the same scheme and domain (`localhost`) they all have the same origin, and do not trigger cross-origin errors."

**Vite's official answer — Troubleshooting › Build › "Built file does not work because of CORS error"** — https://vite.dev/guide/troubleshooting#built-file-does-not-work-because-of-cors-error:

> "If the HTML file output was opened with `file` protocol, the scripts won't run with the following error."

> "Access to script at 'file:///foo/bar.js' from origin 'null' has been blocked by CORS policy: Cross origin requests are only supported for protocol schemes: http, data, isolated-app, chrome-extension, chrome, https, chrome-untrusted." (Chrome)

> "Cross-Origin Request Blocked: The Same Origin Policy disallows reading the remote resource at file:///foo/bar.js. (Reason: CORS request not http)." (Firefox)

Vite's troubleshooting page then points to the MDN page above; it does **not** offer a Vite config that makes `file://` work. `base: './'` only makes URLs relative — https://vite.dev/guide/build#relative-base:

> "If you don't know the base path in advance, you may set a relative base path with `"base": "./"` or `"base": ""`. This will make all generated URLs to be relative to each file."

> "`import.meta` support is required for relative bases. If you need to support browsers that do not support `import.meta`, you can use the `legacy` plugin."

Relative URLs do not change the `file://` opaque-origin problem: the `<script type="module" src="./assets/index-xxxx.js">` is still a CORS-mode fetch from origin `null`. A search of vite.dev for "file://" finds only the troubleshooting page above (no other official guidance).

**Chromium source (why the message reads as it does)** — the exact Chrome strings, from https://chromium.googlesource.com/chromium/src/+/refs/heads/main/third_party/blink/renderer/platform/loader/cors/cors_error_string.cc:

> `"from origin '", origin.ToString(), "' has been blocked by CORS policy: "`
> `"Cross origin requests are only supported for protocol schemes: ", SchemeRegistry::ListOfCorsEnabledURLSchemes(), "."` (case `CorsError::kCorsDisabledScheme`)

**Community plugin `vite-plugin-singlefile`** — README https://github.com/richardtallent/vite-plugin-singlefile:

> "This Vite build plugin allows you to *inline* all JavaScript and CSS resources directly into the final `dist/index.html` file. By doing this, your *entire web app* can be embedded and distributed as a single HTML file."

> "However, this can be *very* handy for *offline* web applications-- apps bundled into a single HTML file that you can double-click and open directly in your web browser, no server needed."

> "**This is a *single file* plugin. As in, it creates *one HTML file* and *no other files*. Hence the name.** ... Issues opened requesting multiple entry points will be closed as `wontfix`."

"What does work when running an HTML file locally" (README list): `localStorage`; "Requests for *local files* relative to the same folder (*i.e.*, for Vue, resources from your `public` folder)"; "Requests to external APIs (requires `{ mode: 'no-cors'}` in your `fetch` call)"; "SPA hash-based routing". "What doesn't work": "SPA routing via Web History API"; "Cookies (passed via HTTP headers, which don't exist for `file:///` URIs)"; "Worklets"; "Sourcemaps". Caveats: "Static resources in `public` folder (like `favicon`) are not inlined by Vite, and this plugin doesn't do that either. BUT the output single HTML file CAN work together with these resouces, using relative paths." and "Inlining of SVG isn't supported directly by Vite, so it isn't supported directly here either."

Options: `useRecommendedBuildConfig` (default `true`), `removeViteModuleLoader` (default `false`), `inlinePattern` (default `[]`), `deleteInlinedFiles` (default `true`), `overrideConfig` ("the default base URL for public non-inlined files is "./"").

Version / licence / date (npm registry https://registry.npmjs.org/vite-plugin-singlefile and GitHub API, read 2026-09-02):
- `dist-tags.latest` = **2.3.3**, published **2026-04-17T22:28:03.802Z** (previous: 2.3.2 and 2.3.1 on 2026-03-15; 2.3.0 on 2025-07-02).
- `license` = **MIT** (repo license file `LICENSE`, GitHub API `spdx_id: MIT`).
- `peerDependencies` of 2.3.3: `vite: ^5.4.21 || ^6.0.0 || ^7.0.0 || ^8.0.0`, `rollup: ^4.59.0`.
- GitHub: latest *Release* object is still tagged v2.3.0 (2025-07-02); repo `pushed_at` 2026-04-17; 1,232 stars; default branch `main`.

Note the README's claim about local requests: "Requests for *local files* relative to the same folder" — this is the plugin author's statement; contrast with Chromium's fetch behaviour in §C2 (an `<img src>`/`<link>` load of a sibling file is a different path from `fetch()`).

### C2. Does `fetch()` of a sibling JSON file work on `file://` in Chrome?

**MDN — `fetch()` exceptions** — https://developer.mozilla.org/en-US/docs/Web/API/Window/fetch: a `TypeError` is thrown when "The requested URL is invalid." / "There is a network error" etc.; MDN "Using Fetch" adds "The promise returned by `fetch()` will reject on some errors, such as a network error or a bad scheme." and "For fetch requests the default value of `mode` is `cors`, meaning that if the request is cross-origin then it will use the Cross-Origin Resource Sharing (CORS) mechanism." (https://developer.mozilla.org/en-US/docs/Web/API/Fetch_API/Using_Fetch). MDN does not document `file:` specifically.

**Chromium source (authoritative for Chrome)** — https://chromium.googlesource.com/chromium/src/+/refs/heads/main/third_party/blink/renderer/core/fetch/fetch_manager.cc:

```cpp
if (SchemeRegistry::ShouldTreatURLSchemeAsSupportingFetchAPI(
        fetch_request_data_->Url().Protocol()) ||
    fetch_request_data_->Url().ProtocolIs("blob")) {
  // "Return the result of performing an HTTP fetch using |request|."
  PerformHTTPFetch(exception_state);
} else if (fetch_request_data_->Url().ProtocolIsData()) {
  PerformDataFetch();
} else {
  // FIXME: implement other protocols.
  FileIssueAndPerformNetworkError(RendererCorsIssueCode::kCorsDisabledScheme);
}
...
PerformNetworkError(
    StrCat({"URL scheme \"", fetch_request_data_->Url().Protocol(),
            "\" is not supported."}),
    issue_id);
```

and https://chromium.googlesource.com/chromium/src/+/refs/heads/main/third_party/blink/renderer/platform/weborigin/scheme_registry.cc initialises `fetch_api_schemes({"http", "https"})`.

→ In Chrome, `fetch('./catalog.json')` from a `file://` page rejects with a `TypeError` whose message is `URL scheme "file" is not supported.` (the scheme is not in the Fetch-API scheme set and is neither `blob:` nor `data:`). The Vite/MDN quotes in §C1 cover Firefox's equivalent ("CORS request not http"). So a `file://` single-file build cannot load a sibling catalog with `fetch()`; it needs the data inlined, pasted, or picked via `<input type="file">` / the File System Access API (both listed as working in the plugin README).

Worker scripts from `file://` are likewise blocked in Chrome — https://chromium.googlesource.com/chromium/src/+/refs/heads/main/third_party/blink/renderer/core/workers/abstract_worker.cc throws a `SecurityError`: `"Script at '", script_url, "' cannot be accessed from origin '", origin, "'."` when the (opaque) origin cannot read the script; MDN's `Worker()` page lists `blob:` URLs as the same-origin-safe alternative ("`blob:` URLs should be used instead, where possible, because the URL inherits the origin of the document that created it").

---

## D. Loading a private catalog via `?src=<url>` from a hosted page — CORS facts

### D1. MDN CORS facts

**MDN — CORS guide** — https://developer.mozilla.org/en-US/docs/Web/HTTP/Guides/CORS:

> "Cross-Origin Resource Sharing (CORS) is an HTTP-header based mechanism that allows a server to indicate any origins (domain, scheme, or port) other than its own from which a browser should permit loading resources."

`Access-Control-Allow-Origin` "specifies either a single origin which tells browsers to allow that origin to access the resource; or else — for requests **without** credentials — the `*` wildcard tells browsers to allow any origin to access the resource."

Simple requests (no preflight) must use `GET`/`HEAD`/`POST`, only CORS-safelisted headers (`Accept`, `Accept-Language`, `Content-Language`, `Content-Type`, `Range`), and a `Content-Type` of `application/x-www-form-urlencoded`, `multipart/form-data` or `text/plain`; otherwise:

> "Unlike simple requests, for "preflighted" requests the browser first sends an HTTP request using the `OPTIONS` method to the resource on the other origin, in order to determine if the actual request is safe to send."

An `Authorization` header is not safelisted → any `fetch(url, { headers: { Authorization } })` is preflighted.

> "By default, in cross-origin `fetch()` or `XMLHttpRequest` calls, browsers will **not** send credentials."

Credentialed requests: the server "must not" use `*` for `Access-Control-Allow-Origin` (nor for `Allow-Headers`/`Allow-Methods`/`Expose-Headers`); "If a request includes a credential and the response includes `Access-Control-Allow-Origin: *`, the browser will block access to the response and report a CORS error."

**MDN — `Access-Control-Allow-Origin`** — https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Access-Control-Allow-Origin:

> "For requests *without credentials*, the literal value `*` can be specified as a wildcard. Attempting to use the wildcard with credentials results in an error."

> "`<origin>` Specifies a single origin. If the server supports clients from multiple origins, it must return the origin for the specific client making the request."

> "the origin of resources that use a non-hierarchical scheme (such as `data:` or `file:`) and sandboxed documents is serialized as `null`. ... Therefore, the `null` value for the `Access-Control-Allow-Origin` header should be avoided."

Responses with an explicit origin "should also include a `Vary` response header with the value `Origin`".

**MDN — `fetch()` `credentials`** — https://developer.mozilla.org/en-US/docs/Web/API/Fetch_API/Using_Fetch: "By default, credentials are only included in same-origin requests." Values: `omit`, `same-origin` (default), `include`.

**Practical rule for the viewer:** a bearer token sent as an `Authorization` header is *not* a "credential" in the CORS sense (cookies/TLS client certs/HTTP auth are), so `Access-Control-Allow-Origin: *` is compatible with it — but it forces a preflight, and the preflight must return 2xx with `Access-Control-Allow-Headers` including `authorization`.

### D2. GitHub — REST contents endpoint and raw.githubusercontent.com

**GitHub — "Using CORS and JSONP"** — https://docs.github.com/en/rest/using-the-rest-api/using-cors-and-jsonp-to-make-cross-origin-requests:

> "The REST API supports cross-origin resource sharing (CORS) for AJAX requests from any origin."

Documented preflight response (verbatim from the page):

```
Access-Control-Allow-Origin: *
Access-Control-Allow-Headers: Authorization, Content-Type, If-Match, If-Modified-Since, If-None-Match, If-Unmodified-Since, X-Requested-With
Access-Control-Allow-Methods: GET, POST, PATCH, PUT, DELETE
Access-Control-Expose-Headers: ETag, Link, x-ratelimit-limit, x-ratelimit-remaining, x-ratelimit-reset, X-OAuth-Scopes, X-Accepted-OAuth-Scopes, X-Poll-Interval
Access-Control-Max-Age: 86400
```

**OBSERVED 2026-09-02:** `OPTIONS https://api.github.com/repos/phix/appContextViewer/contents/README.md` with `Origin: https://phix.github.io` and `Access-Control-Request-Headers: authorization` → `HTTP/2 204`, `access-control-allow-origin: *`, `access-control-allow-headers: Authorization, Content-Type, ... X-GitHub-Api-Version, ...`, `access-control-allow-methods: GET, POST, PATCH, PUT, DELETE`, `access-control-max-age: 86400`.

→ **api.github.com allows a browser `fetch` with an `Authorization` header from any origin.** This is the documented way to read a private-repo file from the browser.

**GitHub — "Get repository content"** — https://docs.github.com/en/rest/repos/contents#get-repository-content: `GET /repos/{owner}/{repo}/contents/{path}`. Media types:

> "`application/vnd.github.raw+json`: Returns the raw file contents for files and symlinks."

Size tiers: files ≤ 1 MB fully supported; "Between 1-100 MB: Only the raw or object custom media types are supported."; "Greater than 100 MB: This endpoint is not supported." And on the `download_url` field:

> "Download URLs expire and are meant to be used just once."

Token: "After creating a token, you can authenticate your request by sending the token in the `Authorization` header of your request." (`Authorization: Bearer YOUR-TOKEN`) — https://docs.github.com/en/rest/authentication/authenticating-to-the-rest-api. Fine-grained tokens need the endpoint's permission ("Contents" read for this endpoint). "Personal access tokens act as your identity ... it is important to keep your personal access tokens secure."

**raw.githubusercontent.com** — GitHub documents it only as the raw file host: "These files are always available in their raw formats, which are served through `raw.githubusercontent.com`" (https://docs.github.com/en/repositories/creating-and-managing-repositories/repository-limits). The IP-allow-list docs show that private raw URLs carry a token query string: "Raw URLs for files in repositories, such as `https://raw.githubusercontent.com/octo-org/octo-repo/main/README.md?token=ABC10001`" (https://docs.github.com/en/enterprise-cloud@latest/organizations/keeping-your-organization-secure/managing-security-settings-for-your-organization/managing-allowed-ip-addresses-for-your-organization). **No GitHub doc states a CORS policy for raw.githubusercontent.com.**

**OBSERVED 2026-09-02** on `https://raw.githubusercontent.com/richardtallent/vite-plugin-singlefile/main/README.md`:
- `GET` (with or without `Origin: https://phix.github.io`): `200`, `access-control-allow-origin: *`, `vary: Authorization,Accept-Encoding`, `content-security-policy: default-src 'none'; style-src 'unsafe-inline'; sandbox`, `x-frame-options: deny`.
- `OPTIONS` preflight with `Access-Control-Request-Headers: authorization`: **`403`** with only `access-control-allow-origin: *` (no `access-control-allow-headers`).
- `GET` with an invalid `Authorization: token ...` header on a public file: `404`.

→ Public raw files are fetchable cross-origin from a browser (simple GET, `*`). **A private-repo raw URL with a bearer token in the `Authorization` header is not fetchable from a browser** (the mandatory preflight gets 403). The documented private path is `api.github.com` (contents endpoint, `Accept: application/vnd.github.raw+json`, ≤ 100 MB) — or a one-shot `download_url` obtained from that endpoint.

### D3. Amazon S3 — presigned URLs and bucket CORS

**AWS — "Download and upload objects with presigned URLs"** — https://docs.aws.amazon.com/AmazonS3/latest/userguide/using-presigned-url.html:

> "You can use presigned URLs to grant time-limited access to objects in Amazon S3 without updating your bucket policy. A presigned URL can be entered in a browser or used by a program to download an object. The credentials used by the presigned URL are those of the AWS Identity and Access Management (IAM) principal who generated the URL."

> "Anyone with valid security credentials can create a presigned URL. But for someone to successfully access an object, the presigned URL must be created by someone who has permission to perform the operation that the presigned URL is based upon."

> "If you create a presigned URL with the Amazon S3 console, the expiration time can be set between 1 minute and 12 hours. If you use the AWS CLI or AWS SDKs, the expiration time can be set as high as 7 days."

> "In essence, presigned URLs are bearer tokens that grant access to those who possess them."

(Temporary credentials cap the URL's life: "IAM role credentials used by Amazon EC2 instances – Valid for the duration of the role credentials (typically 6 hours).")

**AWS — "Using cross-origin resource sharing (CORS)"** — https://docs.aws.amazon.com/AmazonS3/latest/userguide/cors.html:

> "Cross-origin resource sharing (CORS) defines a way for client web applications that are loaded in one domain to interact with resources in a different domain. With CORS support, you can build rich client-side web applications with Amazon S3 and selectively allow cross-origin access to your Amazon S3 resources."

> "A browser would normally block JavaScript from allowing those requests, but with CORS you can configure your bucket to explicitly enable cross-origin requests"

> "The `Origin` header in a CORS request to your bucket must match the origins in the `AllowedOrigins` element in your CORS configuration."

**AWS — "Configuring CORS"** — https://docs.aws.amazon.com/AmazonS3/latest/userguide/enabling-cors-examples.html: "To configure your bucket to allow cross-origin requests, you add a CORS configuration to the bucket. A CORS configuration is a document that defines rules that identify the origins that you will allow to access your bucket, the operations (HTTP methods) supported for each origin, and other operation-specific information. In the S3 console, the CORS configuration must be a JSON document."

**AWS — "Troubleshooting CORS"** — https://docs.aws.amazon.com/AmazonS3/latest/userguide/cors-troubleshooting.html:

> "The following `403 Forbidden` error occurs when a cross-origin request is sent to Amazon S3 but CORS is not configured on your S3 bucket. Error: HTTP/1.1 403 Forbidden CORS Response: CORS is not enabled for this bucket."

→ A presigned GET URL is a simple request (no custom headers), so no preflight — but the bucket still needs a CORS rule with `AllowedOrigins` containing the viewer's origin (or `*`) and `AllowedMethods: ["GET"]`, otherwise the browser cannot read the response.

### D4. Google Drive / Dropbox / OneDrive share links

**Google Drive.** Downloading via the API — https://developers.google.com/workspace/drive/api/guides/manage-downloads:

> "To download a blob file stored on Drive, use the `files.get` method with the ID of the file to download and the `alt` system parameter. The `alt=media` parameter tells the server that a download of content is being requested as an alternative response format."

> "To download the content of blob files stored on Drive within a browser, instead of through the API, use the `webContentLink` field of the `files` resource."

> "File downloads started from your app must be authorized with a scope that allows read access to the file content."

CORS on Google APIs — https://developers.google.com/identity/oauth2/web/guides/use-token-model ("Use REST and CORS with Google APIs"):

> "Google APIs support CORS by default, including an access token in an `XMLHttpRequest` or `fetch` request triggers a CORS preflight check; an OPTIONS request prior to a GET or POST."

→ `https://www.googleapis.com/drive/v3/files/{id}?alt=media` with an OAuth bearer token is fetchable from a browser. Whether a **share link** (`drive.google.com/uc?export=download&id=…` or `webContentLink`) is CORS-readable is *not* stated in Google's docs — see Unverified.

**Dropbox.** Direct-download links — https://help.dropbox.com/share/force-download:

> "To force a browser to download the contents of a link rather than display them, you can use "dl=1" as a query parameter in your URL."

> "To bypass the preview page and allow your browser to directly render your files, use "raw=1" as a query parameter in your URL"

> "Changing "dl=1" or "dl=0" to "raw=1" in a URL will cause an HTTP redirect."

Whether `dl=1` / `raw=1` share links carry CORS headers is not stated on that page — Unverified. (The Dropbox HTTP API reference at https://www.dropbox.com/developers/documentation/http/documentation has a section titled "Browser-based JavaScript and CORS pre-flight requests" for `*.dropboxapi.com` endpoints, but the page is JS-rendered and could not be fetched verbatim here — Unverified.)

**OneDrive / Microsoft Graph.** — https://learn.microsoft.com/en-us/graph/api/driveitem-get-content?view=graph-rest-1.0:

> "To download files in a JavaScript app, you can't use the `/content` API, because this responds with a `302` redirect. A `302` redirect is explicitly prohibited when a Cross-Origin Resource Sharing (CORS) *preflight* is required, such as when providing the **Authorization** header."

> "Instead, your app needs to select the `@microsoft.graph.downloadUrl` property, which returns the same URL that `/content` directs to. This URL can then be requested directly using XMLHttpRequest. Because these URLs are preauthenticated, they can be retrieved without a CORS preflight request."

> "Preauthenticated download URLs are valid for a limited time. Use them immediately, as they might expire within minutes. You don't need to include an `Authorization` header when you access the download URL."

CORS statement — https://learn.microsoft.com/en-us/onedrive/developer/rest-api/concepts/working-with-cors?view=odsp-graph-online: "The OneDrive API supports HTTP access control (CORS) to allow single page JavaScript applications to use the OneDrive API through the common XMLHttpRequest pattern."

Share links via Graph — https://learn.microsoft.com/en-us/graph/api/shares-get?view=graph-rest-1.0: `GET /shares/{shareIdOrEncodedSharingUrl}/driveItem` with `Authorization: Bearer {token}. Required.`; sharing URL encoded as base64url with a `u!` prefix; "For OneDrive for Business and SharePoint, the Shares API always requires authentication and can't be used to access anonymously shared content without a user context."

→ OneDrive is the best-documented of the three for browser use: obtain `@microsoft.graph.downloadUrl` (needs a Graph token), then plain `fetch` it. A bare 1drv.ms share link's CORS behaviour is not documented — Unverified.

### D5. CORS-free alternatives on Vercel: same-origin `/data/catalog.json` behind Deployment Protection, or Vercel Blob

**Same-origin static file (recommended CORS-free path).** Anything in Vite's `public/` directory "are served at `/` during dev and copied to the root of `outDir` during build, and are always served or copied as-is without transform" (https://vite.dev/config/shared-options#publicdir). On Vercel it is served from the same origin as the page, so `fetch('/data/catalog.json')` is a same-origin request — CORS does not apply. With Deployment Protection on, it stays reachable because "Deployment Protection requires authentication for all requests" and, per https://vercel.com/docs/deployment-protection: "For client-side requests, use relative paths in the fetch call to target the current domain. This automatically includes the user's authentication cookie for protected URLs". Constraint: on Hobby only preview/deployment URLs are protected (§B3); gating the production domain needs Pro + the $150/month add-on (or Enterprise). Committing a private catalog into a public repo is of course not private — it would have to live in a private repo/deploy or be uploaded as a build artifact.

**Vercel Blob** — https://vercel.com/docs/vercel-blob (last_updated 2026-08-26). Access modes table: Public storage — Read access "Anyone with the URL", Delivery "Direct blob URL"; Private storage — Read access "Authenticated (token required)", Delivery "Through your Functions via `get()`".

> "With private Blob stores: all read access requires authentication"; "With public Blob stores: blob URLs are accessible to anyone with the link"

> "Files in private Blob stores cannot be accessed via public URLs. You deliver them to your users through Vercel Functions where you implement your own authentication logic." (https://vercel.com/docs/vercel-blob/security)

Public URL form: `https://<store-id>.public.blob.vercel-storage.com/<pathname>` (https://vercel.com/docs/vercel-blob/public-storage); "Vercel Blob URLs, although publicly accessible, are unique and hard to guess when you use the `addRandomSuffix: true` option." Security headers enforced on each blob: `content-security-policy: default-src "none"`, `x-frame-options: DENY`, `x-content-type-options: nosniff`, `content-disposition`. JSON is displayed inline ("images, videos, audio, PDFs, plain text, XML, and JSON"). "This also prevents hosting HTML pages on Vercel Blob."

CORS on public blob URLs is **not documented**. **OBSERVED 2026-09-02** on the docs' example URL `https://1sxstfwepd7zn41q.public.blob.vercel-storage.com/blob-oYnXSVczoLa9yBYMFJOSNdaiiervF5.png` with `Origin: https://phix.github.io`: `200`, `access-control-allow-origin: *`, `access-control-allow-headers: content-type`, `server: Vercel`. So a *public* blob JSON is fetchable cross-origin (e.g. from a GitHub Pages-hosted viewer) today; a *private* blob is not a browser-fetchable URL at all — it needs a Vercel Function (which breaks the "no serverless functions" premise, and Functions count against Hobby limits).

Pricing: "Vercel Blob is free for Hobby users within the usage limits." and "you will not be able to access Vercel Blob if limits are exceeded. In this scenario, you will have to wait until 30 days have passed before using Blob storage again." (https://vercel.com/docs/vercel-blob/usage-and-pricing). Store limit: Hobby 100 stores. Rate limits: Hobby "1,200/min (20/s)" simple ops.

---

## Unverified (no primary source found, or source could not be fetched verbatim)

1. **Vercel Pro without the add-on:** whether "All Deployments" (Vercel Authentication on the production domain) works on plain Pro. The Deployment Protection page says All Deployments is "Available on Pro and Enterprise plans" *and* lists "Private Production Deployments" under the $150/month Advanced Deployment Protection add-on. Treat the add-on as required until tested in the dashboard.
2. **Vercel Blob CORS policy** — only OBSERVED (`access-control-allow-origin: *` on one public blob); no doc states it and it could change. Hobby "included" Blob amounts (5 GB / 100K / 10K / 100 GB in the pricing example) are not explicitly labelled Hobby vs Pro on the page.
3. **raw.githubusercontent.com CORS** — only OBSERVED (`*` on GET, 403 on preflight with `Authorization`); GitHub documents no CORS policy for that host. Also unverified: whether a bearer token in the `Authorization` header is honoured by raw.githubusercontent.com at all (the docs only show the `?token=` query form and the one-shot `download_url`).
4. **Google Drive share links** (`drive.google.com/uc?export=download`, `webContentLink`) — CORS behaviour not stated in Google docs; only the API endpoint (`files.get?alt=media` with an OAuth token) is documented as CORS-enabled. Large-file "virus scan" interstitials on `uc?export=download` are folklore, not documented.
5. **Dropbox** — the HTTP API reference's "Browser-based JavaScript and CORS pre-flight requests" section (arg/authorization as URL params, `Content-Type: text/plain; charset=dropbox-cors-hack`, `reject_cors_preflight=true`) was seen only in a search snippet; the page is JS-rendered and navigation to dropbox.com was blocked in this environment. CORS on `dl=1`/`raw=1` share links and `dl.dropboxusercontent.com`: not documented anywhere official.
6. **OneDrive bare share links** (`1drv.ms/…`, `onedrive.live.com/download?…`) — CORS behaviour not documented; only the Graph `@microsoft.graph.downloadUrl` flow is.
7. **GitHub Pages header set** — absence of CSP/COOP/COEP and presence of `access-control-allow-origin: *` is OBSERVED on three live sites, not documented; GitHub could change it.
8. **`<meta http-equiv="Content-Security-Policy">` on Pages** as a substitute for the header — standard HTML behaviour but not researched against MDN/CSP spec in this pass.
9. **Firefox/Safari `file://` fetch behaviour** — only Chrome (Chromium source) and Firefox's module-script error (Vite/MDN quote) are sourced; Safari not researched.
10. **`vite-plugin-singlefile` README claim** that "Requests for *local files* relative to the same folder" work from `file://` — author's statement; contradicts Chromium's `fetch()` scheme check for `fetch()` specifically (element loads like `<img>`/`<link>` may differ). Not tested here.

---

## Source index

Vite: https://vite.dev/guide/static-deploy · https://vite.dev/config/shared-options · https://vite.dev/guide/build · https://vite.dev/guide/troubleshooting · https://github.com/vitejs/vite/blob/main/docs/guide/static-deploy-github-pages.yaml
GitHub: https://docs.github.com/en/pages/getting-started-with-github-pages/what-is-github-pages · …/using-custom-workflows-with-github-pages · …/configuring-a-publishing-source-for-your-github-pages-site · …/github-pages-limits · …/securing-your-github-pages-site-with-https · https://docs.github.com/en/pages/configuring-a-custom-domain-for-your-github-pages-site/managing-a-custom-domain-for-your-github-pages-site · …/about-custom-domains-and-github-pages · https://docs.github.com/en/billing/managing-billing-for-your-products/about-billing-for-github-actions · https://docs.github.com/en/enterprise-server@3.17/admin/configuring-settings/configuring-user-applications-for-your-enterprise/configuring-github-pages-for-your-enterprise · https://github.com/actions/deploy-pages · https://docs.github.com/en/rest/using-the-rest-api/using-cors-and-jsonp-to-make-cross-origin-requests · https://docs.github.com/en/rest/repos/contents · https://docs.github.com/en/rest/authentication/authenticating-to-the-rest-api · https://docs.github.com/en/repositories/creating-and-managing-repositories/repository-limits
Vercel: https://vercel.com/docs/frameworks/frontend/vite · https://vercel.com/docs/frameworks/frontend · https://vercel.com/docs/builds/configure-a-build · https://vercel.com/docs/plans/hobby · https://vercel.com/pricing · https://vercel.com/docs/pricing · https://vercel.com/docs/limits · https://vercel.com/docs/manage-cdn-usage · https://vercel.com/docs/domains/working-with-domains/add-a-domain · https://vercel.com/docs/domains/working-with-ssl · https://vercel.com/docs/deployment-protection · …/methods-to-protect-deployments/vercel-authentication · …/methods-to-protect-deployments/password-protection · …/methods-to-bypass-deployment-protection/protection-bypass-automation · https://vercel.com/docs/project-configuration · https://vercel.com/docs/project-configuration/vercel-json · https://vercel.com/docs/project-configuration/vercel-ts · https://vercel.com/kb/guide/how-to-enable-cors · https://vercel.com/docs/vercel-blob · https://vercel.com/docs/vercel-blob/public-storage · https://vercel.com/docs/vercel-blob/security · https://vercel.com/docs/vercel-blob/usage-and-pricing
MDN: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Modules · https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/script · https://developer.mozilla.org/en-US/docs/Web/Security/Same-origin_policy · https://developer.mozilla.org/en-US/docs/Web/HTTP/Guides/CORS/Errors/CORSRequestNotHttp · https://developer.mozilla.org/en-US/docs/Web/HTTP/Guides/CORS · https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Access-Control-Allow-Origin · https://developer.mozilla.org/en-US/docs/Web/API/Fetch_API/Using_Fetch · https://developer.mozilla.org/en-US/docs/Web/API/Window/fetch · https://developer.mozilla.org/en-US/docs/Web/API/Worker/Worker · https://developer.mozilla.org/en-US/docs/Web/API/Window/crossOriginIsolated
Chromium source: https://chromium.googlesource.com/chromium/src/+/refs/heads/main/third_party/blink/renderer/core/fetch/fetch_manager.cc · …/third_party/blink/renderer/platform/weborigin/scheme_registry.cc · …/third_party/blink/renderer/platform/loader/cors/cors_error_string.cc · …/third_party/blink/renderer/core/workers/abstract_worker.cc
Plugin: https://github.com/richardtallent/vite-plugin-singlefile · https://registry.npmjs.org/vite-plugin-singlefile
AWS: https://docs.aws.amazon.com/AmazonS3/latest/userguide/using-presigned-url.html · …/ShareObjectPreSignedURL.html · …/cors.html · …/enabling-cors-examples.html · …/cors-troubleshooting.html
Google: https://developers.google.com/workspace/drive/api/guides/manage-downloads · https://developers.google.com/identity/oauth2/web/guides/use-token-model
Dropbox: https://help.dropbox.com/share/force-download
Microsoft: https://learn.microsoft.com/en-us/graph/api/driveitem-get-content?view=graph-rest-1.0 · https://learn.microsoft.com/en-us/onedrive/developer/rest-api/concepts/working-with-cors?view=odsp-graph-online · https://learn.microsoft.com/en-us/graph/api/shares-get?view=graph-rest-1.0

#!/usr/bin/env node
// Deterministic generator for the fictitious AT&T-style Catalog (schema v1, docs/schema-v1.md).
//
//   node samples/att/generate-att.mjs
//
// Emits three files beside itself. Same input, same bytes — no clock, no randomness beyond a
// seeded PRNG, so regenerating is a no-op in git.
//
//   catalog.att.json   the Catalog the viewer loads. Schema v1, nothing else.
//   index.att.json     id / name / description / index per Application, for finding one.
//   details.att.json   the operational context that has no home in schema v1, keyed by APM id.
//
// NOTHING HERE IS REAL. The organisations, systems, teams and vendors are invented to exercise the
// viewer against telecom-shaped data. No AT&T system, identifier or datum appears in this file.

import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const OUT = path.dirname(fileURLToPath(import.meta.url));
const NOTICE =
  'Fictitious dataset. Invented AT&T-style organisations and systems for testing the App Context Viewer; not real AT&T data.';
const GENERATED_AT = '2026-09-03T00:00:00Z'; // fixed, so the bytes are stable

// ---------------------------------------------------------------- PRNG (mulberry32, as samples/generate.mjs)
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rnd = mulberry32(20260903);
const int = (n) => Math.floor(rnd() * n);
const pick = (arr) => arr[int(arr.length)];
const chance = (p) => rnd() < p;
function sample(arr, n) {
  const copy = arr.slice();
  const out = [];
  while (out.length < n && copy.length > 0) out.push(copy.splice(int(copy.length), 1)[0]);
  return out;
}

// ---------------------------------------------------------------- organisations
// Each ATT-IDP org is one delivery portfolio. `layer` orders the portfolios so Dependencies mostly
// run from customer-facing work toward shared platform, which is what makes Blast radius readable.
const ORGS = [
  { org: 'ATT-IDP1', portfolio: 'Network Assurance & OSS', bu: 'Network Operations' },
  { org: 'ATT-IDP2', portfolio: 'Service Fulfillment & Provisioning', bu: 'Service Delivery' },
  { org: 'ATT-IDP3', portfolio: 'Billing, Rating & Revenue', bu: 'Revenue Management' },
  { org: 'ATT-IDP4', portfolio: 'Customer & Digital Channels', bu: 'Consumer Technology' },
  { org: 'ATT-IDP5', portfolio: 'Identity, Security & Shared Platform', bu: 'Enterprise Platform' },
];

// layer: 0 channel/UI, 1 experience API, 2 orchestration, 3 domain service, 4 integration/data, 5 shared
const REPOS = [
  // ---- ATT-IDP1 Network Assurance & OSS
  { org: 'ATT-IDP1', repo: 'network-fault-management', team: 'Network Assurance Engineering', apps: [
    ['Alarm Ingest Gateway', 'service', 4, 'Terminates SNMP traps and vendor alarm feeds from the access and transport network.'],
    ['Alarm Deduplication Processor', 'service', 3, 'Collapses repeated and flapping alarms into a single open condition.'],
    ['Alarm Enrichment Service', 'service', 3, 'Attaches circuit, site and customer context to a raw alarm before correlation.'],
    ['Fault Correlation Engine', 'service', 2, 'Groups related alarms into a single suspected network fault.'],
    ['Root Cause Analyzer', 'service', 2, 'Ranks probable causes for a correlated fault using topology reachability.'],
    ['Trouble Ticket Bridge', 'service', 4, 'Opens, updates and closes tickets in the ITSM system of record.'],
    ['Netcool Probe Adapter', 'service', 4, 'Normalises the legacy event manager feed into the internal alarm model.'],
  ]},
  { org: 'ATT-IDP1', repo: 'network-performance', team: 'Network Assurance Engineering', apps: [
    ['KPI Collection Service', 'service', 4, 'Polls network elements for counters on a fifteen-minute cycle.'],
    ['RAN Performance Aggregator', 'pipeline', 3, 'Rolls radio counters up to cell, site and market.'],
    ['Transport Performance Aggregator', 'pipeline', 3, 'Rolls optical and IP transport counters up to circuit and route.'],
    ['Threshold Crossing Evaluator', 'service', 2, 'Raises a performance condition when a KPI breaches its profile.'],
    ['Performance Lake Loader', 'job', 4, 'Lands aggregated performance data in the analytics estate.'],
    ['Cell Health Scorer', 'service', 3, 'Scores each cell for degradation ahead of a hard failure.'],
  ]},
  { org: 'ATT-IDP1', repo: 'network-inventory', team: 'OSS Platform', apps: [
    ['Physical Inventory Service', 'service', 3, 'System of record for sites, racks, cards, ports and fibre.'],
    ['Logical Inventory Service', 'service', 3, 'System of record for circuits, VLANs, bearers and service instances.'],
    ['Inventory Federation API', 'service', 2, 'One read surface over physical, logical and vendor inventory.'],
    ['Circuit Reconciliation Job', 'job', 4, 'Reconciles discovered circuits against the inventory of record.'],
    ['Topology Graph Service', 'service', 3, 'Serves the connectivity graph used for impact and path queries.'],
    ['Spectrum Registry', 'service', 3, 'Tracks licensed spectrum holdings by market and band.'],
  ]},
  { org: 'ATT-IDP1', repo: 'network-topology', team: 'OSS Platform', apps: [
    ['Topology Discovery Collector', 'service', 4, 'Discovers adjacency from routing protocol and LLDP state.'],
    ['Route Path Resolver', 'service', 3, 'Resolves the working and protect path for a circuit.'],
    ['Impact Path Calculator', 'service', 2, 'Given a failed element, returns the services it carries.'],
  ]},
  { org: 'ATT-IDP1', repo: 'assurance-workflow', team: 'Field Operations Technology', apps: [
    ['Auto-Remediation Orchestrator', 'service', 2, 'Runs closed-loop remediation for known fault signatures.'],
    ['Dispatch Recommendation Service', 'service', 2, 'Decides whether a fault needs a truck roll.'],
    ['Field Work Order Bridge', 'service', 4, 'Pushes work orders to the field workforce management system.'],
    ['Maintenance Window Registry', 'service', 3, 'Holds planned work so alarms during it are suppressed.'],
  ]},
  { org: 'ATT-IDP1', repo: 'ran-analytics', team: 'RAN Analytics', apps: [
    ['5G NR Counter Parser', 'pipeline', 4, 'Parses vendor 5G counter files into the common measurement model.'],
    ['LTE Counter Parser', 'pipeline', 4, 'Parses vendor LTE counter files into the common measurement model.'],
    ['Coverage Heatmap Builder', 'job', 3, 'Builds market coverage rasters from measurement reports.'],
    ['Interference Detector', 'service', 3, 'Flags uplink interference signatures by cell and band.'],
  ]},

  // ---- ATT-IDP2 Service Fulfillment & Provisioning
  { org: 'ATT-IDP2', repo: 'order-orchestration', team: 'Fulfillment Engineering', apps: [
    ['Order Decomposition Engine', 'service', 2, 'Breaks a customer order into the technical orders each system needs.'],
    ['Order State Manager', 'service', 2, 'Owns the lifecycle state of every in-flight order.'],
    ['Fallout Management Service', 'service', 3, 'Queues and works orders that failed automated fulfilment.'],
    ['Order Feasibility Checker', 'service', 3, 'Answers whether an order can be built before it is accepted.'],
    ['Jeopardy Monitor', 'service', 3, 'Flags orders that will miss their committed date.'],
  ]},
  { org: 'ATT-IDP2', repo: 'service-activation', team: 'Activation Engineering', apps: [
    ['Wireless Activation Gateway', 'service', 3, 'Activates, suspends and restores wireless subscribers.'],
    ['Fiber Activation Gateway', 'service', 3, 'Turns up fibre broadband services on the access network.'],
    ['IPTV Activation Service', 'service', 3, 'Entitles video service and set-top devices.'],
    ['Device Provisioning Adapter', 'service', 4, 'Pushes device configuration to the vendor provisioning system.'],
    ['SIM Provisioning Service', 'service', 3, 'Associates SIM stock with subscriber identity.'],
    ['eSIM Profile Manager', 'service', 3, 'Issues and swaps embedded SIM profiles.'],
  ]},
  { org: 'ATT-IDP2', repo: 'resource-assignment', team: 'Fulfillment Engineering', apps: [
    ['Number Inventory Manager', 'service', 3, 'Reserves and assigns telephone numbers by rate centre.'],
    ['IP Address Assignment Service', 'service', 3, 'Assigns customer IP blocks and manages reclaim.'],
    ['ONT Assignment Service', 'service', 3, 'Assigns optical network terminals to premises.'],
    ['Port Assignment Service', 'service', 3, 'Selects and reserves an access port for a service.'],
  ]},
  { org: 'ATT-IDP2', repo: 'fulfillment-integration', team: 'Activation Engineering', apps: [
    ['Ericsson Provisioning Adapter', 'service', 4, 'Speaks the mobile core vendor provisioning interface.'],
    ['Nokia Provisioning Adapter', 'service', 4, 'Speaks the access vendor provisioning interface.'],
    ['CPE Configuration Pusher', 'service', 4, 'Applies gateway configuration to customer premises equipment.'],
    ['Legacy Switch Adapter', 'service', 4, 'Provisions the remaining circuit-switched estate.'],
  ]},
  { org: 'ATT-IDP2', repo: 'address-serviceability', team: 'Fulfillment Engineering', apps: [
    ['Address Validation Service', 'service', 3, 'Normalises and validates a service address.'],
    ['Serviceability Lookup API', 'service', 2, 'Answers what can be sold at an address.'],
    ['Facility Availability Service', 'service', 3, 'Reports spare access facilities serving an address.'],
    ['Geocoding Cache Service', 'service', 4, 'Caches third-party geocoding results.'],
  ]},
  { org: 'ATT-IDP2', repo: 'install-scheduling', team: 'Field Operations Technology', apps: [
    ['Appointment Booking Service', 'service', 3, 'Books and reschedules install and repair appointments.'],
    ['Technician Capacity Service', 'service', 3, 'Publishes available technician capacity by area and skill.'],
    ['Route Optimization Job', 'job', 4, 'Sequences each technician day into a drivable route.'],
  ]},

  // ---- ATT-IDP3 Billing, Rating & Revenue
  { org: 'ATT-IDP3', repo: 'rating-engine', team: 'Revenue Systems', apps: [
    ['Usage Rating Service', 'service', 3, 'Prices rated usage events against the subscriber rate plan.'],
    ['Rate Plan Catalog Service', 'service', 3, 'System of record for rate plans, features and their prices.'],
    ['Discount Engine', 'service', 3, 'Applies account, line and bundle level discounts.'],
    ['Promotion Evaluator', 'service', 3, 'Decides which promotions a subscriber still qualifies for.'],
    ['Roaming Rate Resolver', 'service', 3, 'Resolves partner network rates for roamed usage.'],
  ]},
  { org: 'ATT-IDP3', repo: 'mediation', team: 'Revenue Systems', apps: [
    ['Wireless CDR Mediation', 'pipeline', 4, 'Collects and normalises wireless call and data records.'],
    ['Fiber Usage Mediation', 'pipeline', 4, 'Collects and normalises broadband usage records.'],
    ['Record Deduplication Service', 'service', 4, 'Drops duplicate usage records before rating.'],
    ['Mediation Error Recycler', 'job', 4, 'Re-presents records that failed normalisation.'],
  ]},
  { org: 'ATT-IDP3', repo: 'billing-core', team: 'Billing Platform', apps: [
    ['Invoice Generation Service', 'service', 2, 'Assembles the customer invoice for a billing cycle.'],
    ['Billing Cycle Scheduler', 'job', 3, 'Drives each bill cycle through its stages.'],
    ['Account Balance Service', 'service', 3, 'Holds current balance, credits and unbilled charges.'],
    ['Adjustment Service', 'service', 3, 'Applies credits and debits raised by care or audit.'],
    ['Proration Calculator', 'library', 5, 'Computes mid-cycle proration for plan and feature changes.'],
    ['Tax Calculation Adapter', 'service', 4, 'Calls the tax engine for jurisdictional telecom tax.'],
  ]},
  { org: 'ATT-IDP3', repo: 'payments', team: 'Billing Platform', apps: [
    ['Payment Processing Service', 'service', 3, 'Authorises and captures customer payments.'],
    ['AutoPay Scheduler', 'job', 3, 'Draws scheduled payments on the due date.'],
    ['Refund Service', 'service', 3, 'Returns funds for overpayment and cancelled service.'],
    ['Payment Method Vault Adapter', 'service', 4, 'Exchanges card and bank details for tokens; holds none itself.'],
    ['Collections Trigger Service', 'service', 3, 'Moves delinquent accounts into the collections path.'],
  ]},
  { org: 'ATT-IDP3', repo: 'revenue-assurance', team: 'Revenue Systems', apps: [
    ['Revenue Leakage Detector', 'service', 3, 'Finds usage that was carried but never billed.'],
    ['Usage Reconciliation Job', 'job', 4, 'Reconciles mediated record counts against rated counts.'],
    ['Billing Audit Reporter', 'job', 4, 'Produces the controls evidence the auditors ask for.'],
  ]},
  { org: 'ATT-IDP3', repo: 'billing-integration', team: 'Billing Platform', apps: [
    ['Amdocs Billing Bridge', 'service', 4, 'Synchronises accounts and charges with the vendor billing suite.'],
    ['SAP Revenue Bridge', 'service', 4, 'Posts recognised revenue to the general ledger.'],
    ['Statement Rendering Service', 'service', 3, 'Renders the printable and electronic bill.'],
  ]},

  // ---- ATT-IDP4 Customer & Digital Channels
  { org: 'ATT-IDP4', repo: 'myatt-digital', team: 'Digital Experience', apps: [
    ['myATT Mobile App', 'mobile-app', 0, 'The customer self-service application on iOS and Android.'],
    ['myATT Web App', 'web-app', 0, 'The customer self-service web experience.'],
    ['Digital Experience BFF', 'service', 1, 'One aggregation surface for the mobile and web clients.'],
    ['Account Overview Service', 'service', 3, 'Assembles the landing summary of lines, bill and usage.'],
    ['Usage Dashboard Service', 'service', 3, 'Serves near real-time data usage per line.'],
    ['Bill Detail Service', 'service', 3, 'Serves the itemised bill a customer can drill into.'],
    ['Notification Preference Service', 'service', 3, 'Holds channel and topic preferences for outbound contact.'],
  ]},
  { org: 'ATT-IDP4', repo: 'retail-pos', team: 'Retail Systems', apps: [
    ['Retail Point of Sale', 'web-app', 0, 'The in-store selling and activation application.'],
    ['Store Inventory Service', 'service', 3, 'Tracks device and accessory stock by store.'],
    ['Trade-In Valuation Service', 'service', 3, 'Prices a device trade-in at the counter.'],
    ['Upgrade Eligibility Service', 'service', 3, 'Decides whether a line may upgrade today.'],
  ]},
  { org: 'ATT-IDP4', repo: 'care-platform', team: 'Care Technology', apps: [
    ['Care Agent Desktop', 'web-app', 0, 'The contact centre agent workspace.'],
    ['Interaction History Service', 'service', 3, 'Records every customer contact across channels.'],
    ['Case Management Bridge', 'service', 4, 'Synchronises cases with the CRM system of record.'],
    ['Knowledge Article Service', 'service', 3, 'Serves care procedures to agents and the assistant.'],
    ['Callback Scheduler', 'service', 3, 'Offers and honours a call-back instead of a queue.'],
  ]},
  { org: 'ATT-IDP4', repo: 'customer-profile', team: 'Digital Experience', apps: [
    ['Customer Master Service', 'service', 3, 'System of record for the customer and their accounts.'],
    ['Contact Preference Service', 'service', 3, 'Holds addresses, numbers and contact consent.'],
    ['Household Resolution Service', 'service', 3, 'Resolves individuals into a billing household.'],
    ['Consent Registry', 'service', 3, 'Records privacy consent and its provenance.'],
  ]},
  { org: 'ATT-IDP4', repo: 'digital-commerce', team: 'Digital Experience', apps: [
    ['Device Catalog Service', 'service', 3, 'Serves sellable devices, colours and stock status.'],
    ['Shopping Cart Service', 'service', 3, 'Holds an in-progress order across sessions and channels.'],
    ['Checkout Orchestrator', 'service', 2, 'Turns a cart into a submitted order with credit and payment.'],
    ['Offer Personalization Service', 'service', 3, 'Selects the offers shown to a given customer.'],
    ['Shipping Estimate Service', 'service', 3, 'Quotes delivery dates for a device order.'],
  ]},
  { org: 'ATT-IDP4', repo: 'conversational-ai', team: 'Care Technology', apps: [
    ['Virtual Assistant Router', 'service', 2, 'Routes an assistant conversation to a skill or an agent.'],
    ['Intent Classification Service', 'service', 3, 'Classifies customer utterances into supported intents.'],
    ['Chat Transcript Store', 'service', 4, 'Stores conversation transcripts under retention policy.'],
  ]},

  // ---- ATT-IDP5 Identity, Security & Shared Platform
  { org: 'ATT-IDP5', repo: 'customer-identity', team: 'Identity Engineering', apps: [
    ['Customer SSO Service', 'service', 3, 'Authenticates customers across every digital channel.'],
    ['Session Token Service', 'service', 3, 'Issues, refreshes and revokes session tokens.'],
    ['MFA Challenge Service', 'service', 3, 'Issues and verifies second-factor challenges.'],
    ['Passwordless Enrollment Service', 'service', 3, 'Enrols and manages device-bound passkeys.'],
    ['Identity Recovery Service', 'service', 3, 'Recovers access when a credential is lost.'],
  ]},
  { org: 'ATT-IDP5', repo: 'workforce-identity', team: 'Identity Engineering', apps: [
    ['Employee SSO Adapter', 'service', 4, 'Federates employee sign-in to the corporate directory.'],
    ['Privileged Access Broker', 'service', 3, 'Brokers time-boxed elevated access to production.'],
    ['Role Entitlement Service', 'service', 3, 'Resolves what a role may do in each application.'],
  ]},
  { org: 'ATT-IDP5', repo: 'api-platform', team: 'API Platform', apps: [
    ['API Gateway', 'service', 1, 'The north-south entry point for every external and partner call.'],
    ['Rate Limiting Service', 'service', 3, 'Enforces per-client quota and burst policy.'],
    ['API Key Registry', 'service', 3, 'Issues and revokes partner credentials.'],
    ['Service Registry', 'service', 3, 'Resolves service instances for east-west calls.'],
    ['Schema Registry Proxy', 'service', 4, 'Serves and validates event schemas for producers.'],
  ]},
  { org: 'ATT-IDP5', repo: 'data-platform', team: 'Data Platform', apps: [
    ['Streaming Ingest Service', 'service', 4, 'Accepts event streams and lands them durably.'],
    ['Data Lake Loader', 'job', 4, 'Batches curated data into the analytics estate.'],
    ['Feature Store Service', 'service', 3, 'Serves model features online and offline.'],
    ['Batch Export Job', 'job', 4, 'Delivers agreed extracts to downstream consumers.'],
    ['Data Quality Monitor', 'service', 3, 'Checks landed data against expectations and alerts on drift.'],
  ]},
  { org: 'ATT-IDP5', repo: 'observability', team: 'Observability', apps: [
    ['Metrics Collector', 'service', 4, 'Scrapes and forwards service metrics.'],
    ['Log Shipper', 'service', 4, 'Ships application logs to the searchable store.'],
    ['Distributed Trace Collector', 'service', 4, 'Collects and samples request traces.'],
    ['SLO Evaluator', 'service', 3, 'Computes error budget burn against published objectives.'],
    ['Synthetic Probe Runner', 'job', 4, 'Exercises critical journeys from outside the estate.'],
  ]},
  { org: 'ATT-IDP5', repo: 'shared-libraries', team: 'API Platform', apps: [
    ['Common Logging Library', 'library', 5, 'The logging and correlation-id conventions every service uses.'],
    ['Telecom Model Library', 'library', 5, 'Shared types for subscriber, service and network concepts.'],
    ['Retry Policy Library', 'library', 5, 'Standard backoff, jitter and circuit-breaker policy.'],
    ['CPNI Redaction Library', 'library', 5, 'Redacts proprietary network information from logs and exports.'],
  ]},
  { org: 'ATT-IDP5', repo: 'platform-security', team: 'Platform Security', apps: [
    ['Secrets Broker', 'service', 3, 'Issues short-lived credentials to workloads.'],
    ['Certificate Manager', 'service', 3, 'Issues and rotates internal TLS certificates.'],
    ['Vulnerability Scanner Job', 'job', 4, 'Scans built images and running workloads.'],
    ['CPNI Access Auditor', 'service', 3, 'Records and reviews every access to protected customer data.'],
  ]},
];

// ---------------------------------------------------------------- Externals
const EXTERNALS = [
  ['oracle-exadata', 'database', 'Oracle Exadata', 'Billing and revenue system of record.'],
  ['postgres-fulfillment', 'database', 'PostgreSQL (fulfillment)', 'Order and resource assignment stores.'],
  ['postgres-identity', 'database', 'PostgreSQL (identity)', 'Credential and session metadata store.'],
  ['cassandra-usage', 'database', 'Cassandra', 'High-volume usage and counter store.'],
  ['mongodb-profile', 'database', 'MongoDB', 'Customer profile and preference documents.'],
  ['teradata-edw', 'database', 'Teradata', 'Legacy enterprise data warehouse.'],
  ['snowflake-edw', 'database', 'Snowflake', 'Cloud analytics warehouse.'],
  ['hadoop-datalake', 'storage', 'Hadoop Data Lake', 'Raw and curated network and usage data.'],
  ['s3-object-store', 'storage', 'Object Store', 'Bill images, transcripts and export artefacts.'],
  ['redis-session', 'cache', 'Redis', 'Session and hot-path caching.'],
  ['elasticsearch-logs', 'search', 'Elasticsearch', 'Searchable application and network logs.'],
  ['kafka-event-bus', 'queue', 'Kafka', 'The managed event backbone every Channel rides on.'],
  ['mq-legacy', 'queue', 'IBM MQ', 'Queue estate the circuit-switched systems still use.'],
  ['netcool-omnibus', 'saas', 'Netcool/OMNIbus', 'Legacy network event manager.'],
  ['remedy-itsm', 'saas', 'Remedy', 'Incident and change system of record.'],
  ['servicenow-itsm', 'saas', 'ServiceNow', 'Enterprise service management.'],
  ['salesforce-crm', 'saas', 'Salesforce', 'Customer relationship management.'],
  ['amdocs-cbs', 'saas', 'Amdocs CBS', 'Vendor charging and billing suite.'],
  ['sap-erp', 'saas', 'SAP', 'General ledger and enterprise resource planning.'],
  ['ericsson-oss', 'saas', 'Ericsson OSS', 'Mobile core element management.'],
  ['nokia-netact', 'saas', 'Nokia NetAct', 'Access network element management.'],
  ['ciena-mcp', 'saas', 'Ciena MCP', 'Optical transport domain controller.'],
  ['genesys-cloud', 'saas', 'Genesys Cloud', 'Contact centre routing and telephony.'],
  ['vertex-tax', 'saas', 'Vertex', 'Telecom tax determination.'],
  ['payment-gateway', 'saas', 'Payment Gateway', 'Card and ACH authorisation network.'],
  ['ping-identity', 'identity', 'Ping Identity', 'Customer federation and token issuance.'],
  ['azure-ad', 'identity', 'Entra ID', 'Corporate directory for workforce sign-in.'],
  ['hashicorp-vault', 'secrets', 'Vault', 'Secret storage backing the broker.'],
  ['splunk', 'other', 'Splunk', 'Security and operational analytics.'],
  ['appdynamics', 'other', 'AppDynamics', 'Application performance monitoring.'],
  ['cdn-edge', 'network', 'Edge CDN', 'Static delivery and edge termination.'],
  ['smsc-gateway', 'network', 'SMSC Gateway', 'Short message delivery to subscribers.'],
];

// ---------------------------------------------------------------- Channels
const CHANNELS = {
  'network.alarm.raised': { pub: ['Alarm Enrichment Service'], sub: ['Fault Correlation Engine', 'Auto-Remediation Orchestrator', 'SLO Evaluator'] },
  'network.alarm.cleared': { pub: ['Alarm Deduplication Processor'], sub: ['Fault Correlation Engine', 'Trouble Ticket Bridge'] },
  'network.fault.correlated': { pub: ['Fault Correlation Engine'], sub: ['Root Cause Analyzer', 'Dispatch Recommendation Service', 'Trouble Ticket Bridge'] },
  'network.kpi.threshold-crossed': { pub: ['Threshold Crossing Evaluator'], sub: ['Fault Correlation Engine', 'Cell Health Scorer'] },
  'inventory.circuit.changed': { pub: ['Logical Inventory Service'], sub: ['Circuit Reconciliation Job', 'Topology Graph Service', 'Alarm Enrichment Service'] },
  'topology.path.updated': { pub: ['Route Path Resolver'], sub: ['Impact Path Calculator'] },
  'order.submitted': { pub: ['Checkout Orchestrator', 'Retail Point of Sale'], sub: ['Order Decomposition Engine', 'Interaction History Service'] },
  'order.decomposed': { pub: ['Order Decomposition Engine'], sub: ['Order State Manager', 'Jeopardy Monitor'] },
  'order.fallout': { pub: ['Order State Manager'], sub: ['Fallout Management Service', 'Care Agent Desktop'] },
  'order.completed': { pub: ['Order State Manager'], sub: ['Invoice Generation Service', 'Interaction History Service', 'Notification Preference Service'] },
  'service.activated': { pub: ['Wireless Activation Gateway', 'Fiber Activation Gateway', 'IPTV Activation Service'], sub: ['Order State Manager', 'Account Balance Service', 'Logical Inventory Service'] },
  'service.suspended': { pub: ['Wireless Activation Gateway'], sub: ['Account Balance Service', 'Interaction History Service'] },
  'usage.record.mediated': { pub: ['Wireless CDR Mediation', 'Fiber Usage Mediation'], sub: ['Record Deduplication Service', 'Usage Reconciliation Job'] },
  'usage.record.rated': { pub: ['Usage Rating Service'], sub: ['Account Balance Service', 'Usage Dashboard Service', 'Revenue Leakage Detector'] },
  'billing.invoice.generated': { pub: ['Invoice Generation Service'], sub: ['Statement Rendering Service', 'Notification Preference Service', 'Bill Detail Service'] },
  'payment.posted': { pub: ['Payment Processing Service'], sub: ['Account Balance Service', 'Collections Trigger Service', 'SAP Revenue Bridge'] },
  'payment.failed': { pub: ['Payment Processing Service'], sub: ['Collections Trigger Service', 'Notification Preference Service'] },
  'customer.profile.updated': { pub: ['Customer Master Service'], sub: ['Household Resolution Service', 'Offer Personalization Service', 'Contact Preference Service'] },
  'customer.consent.changed': { pub: ['Consent Registry'], sub: ['Notification Preference Service', 'Offer Personalization Service', 'CPNI Access Auditor'] },
  'identity.login.succeeded': { pub: ['Customer SSO Service'], sub: ['Interaction History Service', 'CPNI Access Auditor'] },
  'identity.mfa.challenged': { pub: ['MFA Challenge Service'], sub: ['CPNI Access Auditor'] },
  'care.case.created': { pub: ['Case Management Bridge'], sub: ['Interaction History Service', 'Callback Scheduler'] },
  'device.shipped': { pub: ['Shipping Estimate Service'], sub: ['Notification Preference Service'] },
  'appointment.booked': { pub: ['Appointment Booking Service'], sub: ['Technician Capacity Service', 'Notification Preference Service'] },
  'assurance.remediation.attempted': { pub: ['Auto-Remediation Orchestrator'], sub: [] }, // W_EMPTY_CHANNEL: no subscriber
  'partner.settlement.due': { pub: [], sub: ['Roaming Rate Resolver'] },                   // W_EMPTY_CHANNEL: no publisher
};

// ---------------------------------------------------------------- build the Applications
let nextApm = 10000;
const apps = [];
const byName = new Map();

for (const { org, repo, team, apps: list } of REPOS) {
  for (const [name, kind, layer, description] of list) {
    const apm = `apm${nextApm}`;
    nextApm += 1;
    const record = {
      apm, name, kind, layer, description, team,
      org, repository: `${org}/${repo}`,
      id: `${org}/${repo}/${apm}`,
      dependsOn: [], publishes: [], subscribes: [],
    };
    apps.push(record);
    byName.set(name, record);
  }
}

const idOf = (name) => byName.get(name).id;

// ---------------------------------------------------------------- Dependencies
// Curated edges first: these are what make the graph tell a story rather than a random walk.
const EDGES = {
  // assurance chain
  'Alarm Deduplication Processor': ['Alarm Ingest Gateway'],
  'Alarm Enrichment Service': ['Alarm Deduplication Processor', 'Inventory Federation API', 'Customer Master Service'],
  'Fault Correlation Engine': ['Alarm Enrichment Service', 'Topology Graph Service', 'Maintenance Window Registry'],
  'Root Cause Analyzer': ['Fault Correlation Engine', 'Impact Path Calculator', 'Topology Graph Service'],
  'Trouble Ticket Bridge': ['Fault Correlation Engine'],
  'Netcool Probe Adapter': ['Alarm Ingest Gateway'],
  'Impact Path Calculator': ['Topology Graph Service', 'Route Path Resolver', 'Logical Inventory Service'],
  'Route Path Resolver': ['Topology Graph Service', 'Logical Inventory Service'],
  'Topology Graph Service': ['Physical Inventory Service', 'Logical Inventory Service', 'Topology Discovery Collector'],
  'Inventory Federation API': ['Physical Inventory Service', 'Logical Inventory Service', 'Spectrum Registry'],
  'Circuit Reconciliation Job': ['Logical Inventory Service', 'Topology Discovery Collector'],
  'Auto-Remediation Orchestrator': ['Root Cause Analyzer', 'Device Provisioning Adapter', 'Maintenance Window Registry'],
  'Dispatch Recommendation Service': ['Root Cause Analyzer', 'Technician Capacity Service'],
  'Field Work Order Bridge': ['Dispatch Recommendation Service'],
  'RAN Performance Aggregator': ['KPI Collection Service', '5G NR Counter Parser', 'LTE Counter Parser'],
  'Transport Performance Aggregator': ['KPI Collection Service'],
  'Threshold Crossing Evaluator': ['RAN Performance Aggregator', 'Transport Performance Aggregator'],
  'Cell Health Scorer': ['RAN Performance Aggregator', 'Interference Detector', 'Feature Store Service'],
  'Coverage Heatmap Builder': ['RAN Performance Aggregator'],
  'Interference Detector': ['5G NR Counter Parser'],
  'Performance Lake Loader': ['RAN Performance Aggregator', 'Transport Performance Aggregator', 'Data Lake Loader'],

  // fulfilment chain
  'Order Decomposition Engine': ['Order Feasibility Checker', 'Rate Plan Catalog Service', 'Telecom Model Library'],
  'Order State Manager': ['Order Decomposition Engine', 'Wireless Activation Gateway', 'Fiber Activation Gateway', 'IPTV Activation Service'],
  'Fallout Management Service': ['Order State Manager'],
  'Jeopardy Monitor': ['Order State Manager', 'Appointment Booking Service'],
  'Order Feasibility Checker': ['Serviceability Lookup API', 'Facility Availability Service', 'Upgrade Eligibility Service'],
  'Serviceability Lookup API': ['Address Validation Service', 'Facility Availability Service'],
  'Facility Availability Service': ['Physical Inventory Service', 'Port Assignment Service'],
  'Address Validation Service': ['Geocoding Cache Service'],
  'Wireless Activation Gateway': ['SIM Provisioning Service', 'Number Inventory Manager', 'Ericsson Provisioning Adapter', 'Customer Master Service'],
  'Fiber Activation Gateway': ['ONT Assignment Service', 'IP Address Assignment Service', 'Nokia Provisioning Adapter', 'CPE Configuration Pusher'],
  'IPTV Activation Service': ['Device Provisioning Adapter', 'Customer Master Service'],
  'eSIM Profile Manager': ['SIM Provisioning Service'],
  'Device Provisioning Adapter': ['Ericsson Provisioning Adapter', 'Nokia Provisioning Adapter'],
  'Appointment Booking Service': ['Technician Capacity Service', 'Address Validation Service'],
  'Route Optimization Job': ['Technician Capacity Service', 'Appointment Booking Service'],
  'ONT Assignment Service': ['Physical Inventory Service'],
  'Port Assignment Service': ['Physical Inventory Service'],
  'Legacy Switch Adapter': ['Number Inventory Manager'],

  // billing chain
  'Record Deduplication Service': ['Wireless CDR Mediation', 'Fiber Usage Mediation'],
  'Mediation Error Recycler': ['Record Deduplication Service'],
  'Usage Rating Service': ['Record Deduplication Service', 'Rate Plan Catalog Service', 'Discount Engine', 'Roaming Rate Resolver'],
  'Discount Engine': ['Rate Plan Catalog Service', 'Promotion Evaluator'],
  'Promotion Evaluator': ['Rate Plan Catalog Service', 'Customer Master Service'],
  'Invoice Generation Service': ['Usage Rating Service', 'Account Balance Service', 'Adjustment Service', 'Proration Calculator', 'Tax Calculation Adapter'],
  'Billing Cycle Scheduler': ['Invoice Generation Service', 'Statement Rendering Service'],
  'Account Balance Service': ['Adjustment Service', 'Payment Processing Service'],
  'Adjustment Service': ['Proration Calculator'],
  'Statement Rendering Service': ['Invoice Generation Service', 'Bill Detail Service'],
  'Payment Processing Service': ['Payment Method Vault Adapter', 'Customer Master Service'],
  'AutoPay Scheduler': ['Payment Processing Service', 'Account Balance Service'],
  'Refund Service': ['Payment Processing Service', 'Adjustment Service'],
  'Collections Trigger Service': ['Account Balance Service'],
  'Revenue Leakage Detector': ['Usage Rating Service', 'Usage Reconciliation Job'],
  'Usage Reconciliation Job': ['Record Deduplication Service', 'Data Lake Loader'],
  'Billing Audit Reporter': ['Invoice Generation Service', 'CPNI Access Auditor'],
  'Amdocs Billing Bridge': ['Account Balance Service'],
  'SAP Revenue Bridge': ['Invoice Generation Service'],

  // digital chain
  'myATT Mobile App': ['Digital Experience BFF'],
  'myATT Web App': ['Digital Experience BFF'],
  'Digital Experience BFF': ['API Gateway', 'Account Overview Service', 'Usage Dashboard Service', 'Bill Detail Service', 'Customer SSO Service'],
  'Account Overview Service': ['Customer Master Service', 'Account Balance Service', 'Device Catalog Service'],
  'Usage Dashboard Service': ['Usage Rating Service', 'Customer Master Service'],
  'Bill Detail Service': ['Invoice Generation Service', 'Account Balance Service'],
  'Notification Preference Service': ['Contact Preference Service', 'Consent Registry'],
  'Retail Point of Sale': ['API Gateway', 'Store Inventory Service', 'Upgrade Eligibility Service', 'Trade-In Valuation Service', 'Checkout Orchestrator'],
  'Upgrade Eligibility Service': ['Customer Master Service', 'Account Balance Service'],
  'Trade-In Valuation Service': ['Device Catalog Service'],
  'Care Agent Desktop': ['API Gateway', 'Interaction History Service', 'Knowledge Article Service', 'Case Management Bridge', 'Customer Master Service', 'Account Balance Service'],
  'Interaction History Service': ['Customer Master Service'],
  'Callback Scheduler': ['Interaction History Service'],
  'Customer Master Service': ['Household Resolution Service', 'Contact Preference Service'],
  'Household Resolution Service': ['Contact Preference Service'],
  'Checkout Orchestrator': ['Shopping Cart Service', 'Payment Processing Service', 'Device Catalog Service', 'Address Validation Service', 'Shipping Estimate Service'],
  'Shopping Cart Service': ['Device Catalog Service', 'Offer Personalization Service'],
  'Offer Personalization Service': ['Customer Master Service', 'Feature Store Service', 'Promotion Evaluator'],
  'Shipping Estimate Service': ['Store Inventory Service'],
  'Virtual Assistant Router': ['Intent Classification Service', 'Knowledge Article Service', 'Chat Transcript Store', 'Customer SSO Service'],
  'Intent Classification Service': ['Feature Store Service'],

  // platform chain
  'API Gateway': ['Rate Limiting Service', 'Service Registry', 'API Key Registry', 'Certificate Manager'],
  'Customer SSO Service': ['Session Token Service', 'MFA Challenge Service', 'Customer Master Service'],
  'Session Token Service': ['Secrets Broker'],
  'MFA Challenge Service': ['Contact Preference Service'],
  'Passwordless Enrollment Service': ['Session Token Service'],
  'Identity Recovery Service': ['MFA Challenge Service', 'Contact Preference Service'],
  'Privileged Access Broker': ['Role Entitlement Service', 'Secrets Broker', 'Employee SSO Adapter'],
  'Rate Limiting Service': ['Service Registry'],
  'Streaming Ingest Service': ['Schema Registry Proxy'],
  'Data Lake Loader': ['Streaming Ingest Service'],
  'Feature Store Service': ['Data Lake Loader'],
  'Batch Export Job': ['Data Lake Loader', 'CPNI Redaction Library'],
  'Data Quality Monitor': ['Data Lake Loader'],
  'SLO Evaluator': ['Metrics Collector', 'Distributed Trace Collector'],
  'Synthetic Probe Runner': ['API Gateway'],
  'Secrets Broker': ['Certificate Manager'],
  'CPNI Access Auditor': ['CPNI Redaction Library', 'Log Shipper'],
  'Vulnerability Scanner Job': ['Service Registry'],
  'Case Management Bridge': ['Customer Master Service'],
  'Knowledge Article Service': [],
};

for (const [name, deps] of Object.entries(EDGES)) {
  const app = byName.get(name);
  if (app === undefined) throw new Error(`EDGES names an unknown Application: ${name}`);
  for (const dep of deps) {
    if (byName.get(dep) === undefined) throw new Error(`EDGES names an unknown target: ${dep} (from ${name})`);
    if (dep === name) throw new Error(`self-dependency: ${name}`);
    app.dependsOn.push(idOf(dep));
  }
}

// Two deliberate cycles — the schema allows them and the viewer must survive them.
byName.get('Secrets Broker').dependsOn.push(idOf('Certificate Manager'));
byName.get('Certificate Manager').dependsOn.push(idOf('Secrets Broker'));
byName.get('Order State Manager').dependsOn.push(idOf('Fallout Management Service'));

// Shared libraries: most services use the logging library, many use retry policy.
for (const app of apps) {
  if (app.kind === 'library') continue;
  if (app.layer <= 4 && chance(0.62)) app.dependsOn.push(idOf('Common Logging Library'));
  if (app.layer <= 4 && chance(0.34)) app.dependsOn.push(idOf('Retry Policy Library'));
  if (app.layer === 3 && chance(0.22)) app.dependsOn.push(idOf('Telecom Model Library'));
}

// Externals, by role. Every service that stores something names its store.
const STORE_BY_TEAM = {
  'Network Assurance Engineering': ['external:cassandra-usage', 'external:elasticsearch-logs'],
  'OSS Platform': ['external:postgres-fulfillment', 'external:hadoop-datalake'],
  'RAN Analytics': ['external:hadoop-datalake', 'external:cassandra-usage'],
  'Field Operations Technology': ['external:postgres-fulfillment'],
  'Fulfillment Engineering': ['external:postgres-fulfillment'],
  'Activation Engineering': ['external:postgres-fulfillment', 'external:mq-legacy'],
  'Revenue Systems': ['external:oracle-exadata', 'external:cassandra-usage'],
  'Billing Platform': ['external:oracle-exadata'],
  'Digital Experience': ['external:mongodb-profile', 'external:redis-session'],
  'Retail Systems': ['external:postgres-fulfillment'],
  'Care Technology': ['external:mongodb-profile', 'external:s3-object-store'],
  'Identity Engineering': ['external:postgres-identity', 'external:redis-session'],
  'API Platform': ['external:redis-session'],
  'Data Platform': ['external:hadoop-datalake', 'external:snowflake-edw'],
  'Observability': ['external:elasticsearch-logs'],
  'Platform Security': ['external:hashicorp-vault'],
};
const NAMED_EXTERNALS = {
  'Netcool Probe Adapter': ['external:netcool-omnibus'],
  'Trouble Ticket Bridge': ['external:remedy-itsm', 'external:servicenow-itsm'],
  'Field Work Order Bridge': ['external:servicenow-itsm'],
  'Ericsson Provisioning Adapter': ['external:ericsson-oss'],
  'Nokia Provisioning Adapter': ['external:nokia-netact'],
  'Topology Discovery Collector': ['external:ciena-mcp', 'external:nokia-netact'],
  'KPI Collection Service': ['external:ericsson-oss', 'external:nokia-netact'],
  'Legacy Switch Adapter': ['external:mq-legacy'],
  'Case Management Bridge': ['external:salesforce-crm'],
  'Amdocs Billing Bridge': ['external:amdocs-cbs'],
  'SAP Revenue Bridge': ['external:sap-erp'],
  'Tax Calculation Adapter': ['external:vertex-tax'],
  'Payment Method Vault Adapter': ['external:payment-gateway'],
  'Payment Processing Service': ['external:payment-gateway'],
  'Customer SSO Service': ['external:ping-identity'],
  'Employee SSO Adapter': ['external:azure-ad'],
  'Secrets Broker': ['external:hashicorp-vault'],
  'Certificate Manager': ['external:hashicorp-vault'],
  'CPNI Access Auditor': ['external:splunk'],
  'Metrics Collector': ['external:appdynamics'],
  'Log Shipper': ['external:elasticsearch-logs', 'external:splunk'],
  'Distributed Trace Collector': ['external:appdynamics'],
  'Statement Rendering Service': ['external:s3-object-store'],
  'Chat Transcript Store': ['external:s3-object-store'],
  'Callback Scheduler': ['external:genesys-cloud'],
  'Care Agent Desktop': ['external:genesys-cloud'],
  'Notification Preference Service': ['external:smsc-gateway'],
  'myATT Web App': ['external:cdn-edge'],
  'Retail Point of Sale': ['external:cdn-edge'],
  'Geocoding Cache Service': ['external:redis-session'],
  'Streaming Ingest Service': ['external:kafka-event-bus'],
  'Schema Registry Proxy': ['external:kafka-event-bus'],
  'Data Lake Loader': ['external:hadoop-datalake', 'external:snowflake-edw'],
  'Batch Export Job': ['external:s3-object-store'],
  'Performance Lake Loader': ['external:hadoop-datalake'],
  'Wireless CDR Mediation': ['external:kafka-event-bus', 'external:cassandra-usage'],
  'Fiber Usage Mediation': ['external:kafka-event-bus'],
  'Synthetic Probe Runner': ['external:appdynamics'],
  'Vulnerability Scanner Job': ['external:splunk'],
  'Feature Store Service': ['external:snowflake-edw'],
  'Billing Audit Reporter': ['external:teradata-edw'],
  'Usage Reconciliation Job': ['external:teradata-edw'],
};

for (const app of apps) {
  const named = NAMED_EXTERNALS[app.name] ?? [];
  for (const ref of named) app.dependsOn.push(ref);
  if (app.kind === 'library') continue;
  const stores = STORE_BY_TEAM[app.team] ?? [];
  if (stores.length > 0 && app.layer <= 4 && chance(0.55)) {
    const store = pick(stores);
    if (!app.dependsOn.includes(store)) app.dependsOn.push(store);
  }
}

// Anything that publishes or subscribes rides the event bus.
for (const [channel, { pub, sub }] of Object.entries(CHANNELS)) {
  for (const name of pub) {
    const app = byName.get(name);
    if (app === undefined) throw new Error(`CHANNELS publisher unknown: ${name}`);
    app.publishes.push(channel);
  }
  for (const name of sub) {
    const app = byName.get(name);
    if (app === undefined) throw new Error(`CHANNELS subscriber unknown: ${name}`);
    app.subscribes.push(channel);
  }
}
for (const app of apps) {
  if (app.publishes.length + app.subscribes.length > 0) {
    if (!app.dependsOn.includes('external:kafka-event-bus')) app.dependsOn.push('external:kafka-event-bus');
  }
}

// ---------------------------------------------------------------- Attributes
const LIFECYCLE = [['production', 84], ['pilot', 6], ['sunset', 10]];
const HOSTING = [['aws', 46], ['azure', 18], ['on-prem', 30], ['edge', 6]];
const LANGUAGES = [['java', 38], ['python', 18], ['go', 14], ['typescript', 16], ['scala', 6], ['c#', 8]];
function weighted(pairs) {
  let r = rnd() * pairs.reduce((s, [, w]) => s + w, 0);
  for (const [v, w] of pairs) if ((r -= w) < 0) return v;
  return pairs[pairs.length - 1][0];
}

const PCI_TEAMS = new Set(['Billing Platform', 'Retail Systems']);
const CPNI_TEAMS = new Set(['Revenue Systems', 'Billing Platform', 'Digital Experience', 'Care Technology', 'Identity Engineering', 'Network Assurance Engineering']);
const SOX_TEAMS = new Set(['Revenue Systems', 'Billing Platform']);

for (const app of apps) {
  const org = ORGS.find((o) => o.org === app.org);
  // tier 0 is "an outage is a national incident", 3 is "internal only"
  const tier = app.layer <= 1 ? 0 : app.layer === 2 ? weighted([[0, 25], [1, 75]]) : app.layer === 3 ? weighted([[1, 45], [2, 55]]) : weighted([[2, 55], [3, 45]]);
  app.attributes = {
    org: app.org,
    portfolio: org.portfolio,
    businessUnit: org.bu,
    tier,
    lifecycle: weighted(LIFECYCLE),
    hosting: weighted(HOSTING),
    language: weighted(LANGUAGES),
    cpni: CPNI_TEAMS.has(app.team) && app.layer <= 4,
    pci: PCI_TEAMS.has(app.team) && chance(0.5),
    sox: SOX_TEAMS.has(app.team),
  };
}

// Sparseness the viewer must survive: a handful of records carry only what the schema requires.
for (const name of ['Retry Policy Library', 'Proration Calculator']) {
  const app = byName.get(name);
  delete app.attributes;
  app.sparse = true;
}
byName.get('Common Logging Library').team = undefined;   // an Application with no Team
byName.get('CPNI Redaction Library').kind = undefined;    // an Application with no kind

// ---------------------------------------------------------------- emit
function applicationRecord(app) {
  const out = { repository: app.repository, project: app.apm, name: app.name };
  if (app.kind !== undefined) out.kind = app.kind;
  if (app.team !== undefined) out.team = app.team;
  out.description = app.description;
  if (app.dependsOn.length > 0) out.dependsOn = [...new Set(app.dependsOn)].sort();
  if (app.publishes.length > 0) out.publishes = [...new Set(app.publishes)].sort();
  if (app.subscribes.length > 0) out.subscribes = [...new Set(app.subscribes)].sort();
  if (app.attributes !== undefined) out.attributes = app.attributes;
  return out;
}

const catalog = {
  schemaVersion: 1,
  generatedAt: GENERATED_AT,
  source: NOTICE,
  applications: apps.map(applicationRecord),
  externals: EXTERNALS.map(([id, kind, name, description]) => ({ id, kind, name, description })),
};

const index = {
  generatedAt: GENERATED_AT,
  source: NOTICE,
  catalog: './catalog.att.json',
  details: './details.att.json',
  apmRange: { first: 'apm10000', last: `apm${nextApm - 1}`, count: apps.length },
  organizations: ORGS.map(({ org, portfolio, bu }) => ({
    org, portfolio, businessUnit: bu,
    repositories: [...new Set(REPOS.filter((r) => r.org === org).map((r) => `${r.org}/${r.repo}`))],
    applications: apps.filter((a) => a.org === org).length,
  })),
  applications: apps.map((app, i) => ({
    index: i,
    apm: app.apm,
    id: app.id,
    name: app.name,
    description: app.description,
    org: app.org,
    repository: app.repository,
    kind: app.kind ?? null,
    team: app.team ?? null,
  })),
};

const CHANGE_WINDOWS = ['Sun 02:00-06:00 CT', 'Sat 23:00-03:00 CT', 'Tue 03:00-05:00 CT', 'nightly 01:00-02:00 CT'];
const SLA = { 0: '99.99%', 1: '99.95%', 2: '99.9%', 3: '99.5%' };

const details = {
  generatedAt: GENERATED_AT,
  source: NOTICE,
  keyedBy: 'apm',
  details: Object.fromEntries(apps.map((app, i) => {
    const a = app.attributes;
    const tier = a?.tier ?? 3;
    const compliance = [];
    if (a?.cpni) compliance.push('CPNI');
    if (a?.pci) compliance.push('PCI-DSS');
    if (a?.sox) compliance.push('SOX');
    const appDeps = app.dependsOn.filter((d) => !d.startsWith('external:'));
    const extDeps = app.dependsOn.filter((d) => d.startsWith('external:'));
    return [app.apm, {
      index: i,
      id: app.id,
      name: app.name,
      description: app.description,
      org: app.org,
      repository: app.repository,
      team: app.team ?? null,
      kind: app.kind ?? null,
      tier,
      slaTarget: SLA[tier],
      lifecycle: a?.lifecycle ?? 'production',
      hosting: a?.hosting ?? 'on-prem',
      language: a?.language ?? null,
      compliance,
      dataClassification: a?.cpni ? 'CPNI-restricted' : tier <= 1 ? 'internal-confidential' : 'internal',
      supportGroup: `${app.team ?? 'Unassigned'} — Tier ${Math.max(1, tier)} on-call`,
      changeWindow: CHANGE_WINDOWS[i % CHANGE_WINDOWS.length],
      runbook: `https://runbooks.example.internal/${app.apm}`,
      dependencies: { applications: new Set(appDeps).size, externals: new Set(extDeps).size },
      channels: { publishes: [...new Set(app.publishes)].sort(), subscribes: [...new Set(app.subscribes)].sort() },
    }];
  })),
};

const write = (file, value) => {
  writeFileSync(path.join(OUT, file), `${JSON.stringify(value, null, 2)}\n`);
  console.log(`wrote ${file}`);
};
write('catalog.att.json', catalog);
write('index.att.json', index);
write('details.att.json', details);
console.log(`${apps.length} Applications, apm10000..apm${nextApm - 1}, ${EXTERNALS.length} Externals, ${Object.keys(CHANNELS).length} Channels`);

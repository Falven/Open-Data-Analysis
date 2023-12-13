import { string, z } from 'zod';

export const JupyterServerStateDetailsSchema = z.object({
  pod_name: z.string(),
  namespace: z.string(),
  dns_name: z.string(),
});

export type JupyterServerStateDetails = z.infer<typeof JupyterServerStateDetailsSchema>;

export const isJupyterServerStateDetails = (obj: unknown): obj is JupyterServerStateDetails =>
  JupyterServerStateDetailsSchema.safeParse(obj).success;

export const JupyterServerDetailsSchema = z.object({
  name: z.string(),
  ready: z.boolean(),
  stopped: z.boolean(),
  pending: z.string().nullable(),
  url: z.string(),
  progress_url: z.string(),
  // ISO 8601 date string
  started: z.string(),
  // ISO 8601 date strings
  last_activity: z.string(),
  state: z.record(z.unknown()),
  user_options: z.record(JupyterServerStateDetailsSchema),
});

export type JupyterServerDetails = z.infer<typeof JupyterServerDetailsSchema>;

export const isJupyterServerDetails = (obj: unknown): obj is JupyterServerDetails =>
  JupyterServerDetailsSchema.safeParse(obj).success;

export const JupyterHubUserSchema = z.object({
  name: z.string(),
  admin: z.boolean(),
  roles: z.array(z.string()),
  groups: z.array(z.string()),
  server: z.string().nullable(),
  pending: z.string().nullable(),
  // ISO 8601 date string
  last_activity: z.string().nullable(),
  servers: z.record(JupyterServerDetailsSchema),
  auth_state: z.record(z.unknown()).nullable(),
  kind: z.string(),
  created: z.string(),
});

export type JupyterHubUser = z.infer<typeof JupyterHubUserSchema>;

export const isJupyterHubUser = (obj: unknown): obj is JupyterHubUser =>
  JupyterHubUserSchema.safeParse(obj).success;

const ManagedFieldSchema = z.object({
  manager: z.string(),
  operation: z.string(),
  apiVersion: z.string(),
  time: z.string(),
  fieldsType: z.string(),
  fieldsV1: z.record(z.object({})),
});

export type ManagedField = z.infer<typeof ManagedFieldSchema>;

export const isManagedField = (obj: unknown): obj is ManagedField =>
  ManagedFieldSchema.safeParse(obj).success;

const MetadataSchema = z.object({
  name: z.string(),
  namespace: z.string(),
  uid: z.string(),
  resourceVersion: z.string(),
  creationTimestamp: z.string(),
  managedFields: z.array(ManagedFieldSchema),
});

export type Metadata = z.infer<typeof MetadataSchema>;

export const isMetadata = (obj: unknown): obj is Metadata => MetadataSchema.safeParse(obj).success;

const InvolvedObjectSchema = z.object({
  kind: z.string(),
  namespace: z.string(),
  name: z.string(),
  uid: z.string(),
  apiVersion: z.string(),
  resourceVersion: z.string(),
});

export type InvolvedObject = z.infer<typeof InvolvedObjectSchema>;

export const isInvolvedObject = (obj: unknown): obj is InvolvedObject =>
  InvolvedObjectSchema.safeParse(obj).success;

const RawProgressEventSchema = z.object({
  kind: z.string(),
  apiVersion: z.string(),
  metadata: MetadataSchema,
  involvedObject: InvolvedObjectSchema,
  reason: z.string(),
  message: z.string(),
  source: z.record(z.unknown()),
  firstTimestamp: z.string().nullable(),
  lastTimestamp: z.string().nullable(),
  type: z.string(),
  eventTime: z.string(),
  action: z.string(),
  reportingComponent: z.string(),
  reportingInstance: z.string(),
});

export type RawProgressEvent = z.infer<typeof RawProgressEventSchema>;

export const isRawProgressEvent = (obj: unknown): obj is RawProgressEvent =>
  RawProgressEventSchema.safeParse(obj).success;

/**
 * An event for tracking the progress of a Jupyter server startup.
 */
export const ProgressEventSchema = z.object({
  progress: z.number().min(0).max(100),
  raw_event: RawProgressEventSchema.optional(),
  message: z.string(),
  ready: z.boolean(),
  html_message: z.string().optional(),
  url: z.string().optional(),
});

export type ProgressEvent = z.infer<typeof ProgressEventSchema>;

export const isProgressEvent = (obj: unknown): obj is ProgressEvent =>
  ProgressEventSchema.safeParse(obj).success;

import { z } from 'zod';

export const JupyterServerStateDetailsSchema = z.object({
  pod_name: z.string(),
  namespace: z.string(),
  dns_name: z.string(),
});

export type JupyterServerStateDetails = z.infer<typeof JupyterServerStateDetailsSchema>;

export const isJupyterServerStateDetails = (obj: unknown): obj is JupyterServerStateDetails => {
  const result = JupyterServerStateDetailsSchema.safeParse(obj);
  if (!result.success) {
    console.error('JupyterServerStateDetails validation failed:', result.error);
  }
  return result.success;
};

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
  state: z.record(z.unknown()).optional(),
  user_options: z.record(JupyterServerStateDetailsSchema),
});

export type JupyterServerDetails = z.infer<typeof JupyterServerDetailsSchema>;

export const isJupyterServerDetails = (obj: unknown): obj is JupyterServerDetails => {
  const result = JupyterServerDetailsSchema.safeParse(obj);
  if (!result.success) {
    console.error('JupyterServerDetails validation failed:', result.error);
  }
  return result.success;
};

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

export const isJupyterHubUser = (obj: unknown): obj is JupyterHubUser => {
  const result = JupyterHubUserSchema.safeParse(obj);
  if (!result.success) {
    console.error('JupyterHubUser validation failed:', result.error);
  }
  return result.success;
};

const ManagedFieldSchema = z.object({
  manager: z.string(),
  operation: z.string(),
  apiVersion: z.string(),
  time: z.string(),
  fieldsType: z.string(),
  fieldsV1: z.record(z.object({})),
});

export type ManagedField = z.infer<typeof ManagedFieldSchema>;

export const isManagedField = (obj: unknown): obj is ManagedField => {
  const result = ManagedFieldSchema.safeParse(obj);
  if (!result.success) {
    console.error('ManagedField validation failed:', result.error);
  }
  return result.success;
};

const MetadataSchema = z.object({
  name: z.string(),
  namespace: z.string(),
  uid: z.string(),
  resourceVersion: z.string(),
  creationTimestamp: z.string(),
  managedFields: z.array(ManagedFieldSchema),
});

export type Metadata = z.infer<typeof MetadataSchema>;

export const isMetadata = (obj: unknown): obj is Metadata => {
  const result = MetadataSchema.safeParse(obj);
  if (!result.success) {
    console.error('Metadata validation failed:', result.error);
  }
  return result.success;
};

const InvolvedObjectSchema = z.object({
  kind: z.string(),
  namespace: z.string(),
  name: z.string(),
  uid: z.string(),
  apiVersion: z.string(),
  resourceVersion: z.string(),
  fieldPath: z.string().optional(),
});

export type InvolvedObject = z.infer<typeof InvolvedObjectSchema>;

export const isInvolvedObject = (obj: unknown): obj is InvolvedObject => {
  const result = InvolvedObjectSchema.safeParse(obj);
  if (!result.success) {
    console.error('InvolvedObject validation failed:', result.error);
  }
  return result.success;
};

const EventSourceSchema = z.object({
  component: z.string(),
  host: z.string(),
});

export type EventSource = z.infer<typeof EventSourceSchema>;

export const isEventSource = (obj: unknown): obj is EventSource => {
  const result = EventSourceSchema.safeParse(obj);
  if (!result.success) {
    console.error('EventSource validation failed:', result.error);
  }
  return result.success;
};

const RawProgressEventSchema = z.object({
  kind: z.string().optional(),
  apiVersion: z.string(),
  metadata: MetadataSchema,
  involvedObject: InvolvedObjectSchema,
  reason: z.string(),
  message: z.string(),
  source: z.record(EventSourceSchema),
  firstTimestamp: z.string().nullable(),
  lastTimestamp: z.string().nullable(),
  count: z.number().optional(),
  type: z.string(),
  eventTime: z.string().nullable(),
  action: z.string().optional(),
  reportingComponent: z.string(),
  reportingInstance: z.string(),
});

export type RawProgressEvent = z.infer<typeof RawProgressEventSchema>;

export const isRawProgressEvent = (obj: unknown): obj is RawProgressEvent => {
  const result = RawProgressEventSchema.safeParse(obj);
  if (!result.success) {
    console.error('RawProgressEvent validation failed:', result.error);
  }
  return result.success;
};

/**
 * An event for tracking the progress of a Jupyter server startup.
 */
export const ProgressEventSchema = z.object({
  progress: z.number().min(0).max(100),
  raw_event: RawProgressEventSchema.optional(),
  message: z.string(),
  ready: z.boolean().optional(),
  html_message: z.string().optional(),
  url: z.string().optional(),
});

export type ProgressEvent = z.infer<typeof ProgressEventSchema>;

export const isProgressEvent = (obj: unknown): obj is ProgressEvent => {
  const result = ProgressEventSchema.safeParse(obj);
  if (!result.success) {
    console.error('ProgressEvent validation failed:', result.error);
  }
  return result.success;
};

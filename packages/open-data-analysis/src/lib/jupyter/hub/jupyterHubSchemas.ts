import { z } from 'zod';

export const JupyterServerUserOptionsSchema = z.object({
  conversationId: z.string(),
});

export type JupyterServerUserOptions = z.infer<typeof JupyterServerUserOptionsSchema>;

export const isJupyterServerUserOptions = (obj: unknown): obj is JupyterServerUserOptions => {
  const result = JupyterServerUserOptionsSchema.safeParse(obj);
  if (!result.success) {
    console.error('JupyterServerUserOptions validation failed:', result.error);
  }
  return result.success;
};

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
  started: z.string().refine((date) => !isNaN(Date.parse(date)), {
    message: 'Invalid date format for "started"',
  }),
  last_activity: z.string().refine((date) => !isNaN(Date.parse(date)), {
    message: 'Invalid date format for "expires_at"',
  }),
  state: z.record(z.unknown()).optional(),
  user_options: JupyterServerUserOptionsSchema,
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
  last_activity: z
    .string()
    .refine((date) => !isNaN(Date.parse(date)), {
      message: 'Invalid date format for "last_activity"',
    })
    .nullable(),
  servers: z.record(JupyterServerDetailsSchema),
  auth_state: z.record(z.unknown()).nullable(),
  kind: z.string(),
  created: z.string().refine((date) => !isNaN(Date.parse(date)), {
    message: 'Invalid date format for "created"',
  }),
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
  creationTimestamp: z.string().refine((date) => !isNaN(Date.parse(date)), {
    message: 'Invalid date format for "creationTimestamp"',
  }),
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
  component: z.string().optional(),
  host: z.string().optional(),
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
  apiVersion: z.string().optional(),
  metadata: MetadataSchema,
  involvedObject: InvolvedObjectSchema,
  reason: z.string(),
  message: z.string(),
  source: EventSourceSchema,
  firstTimestamp: z
    .string()
    .refine((date) => !isNaN(Date.parse(date)), {
      message: 'Invalid date format for "firstTimestamp"',
    })
    .nullable(),
  lastTimestamp: z
    .string()
    .refine((date) => !isNaN(Date.parse(date)), {
      message: 'Invalid date format for "lastTimestamp"',
    })
    .nullable(),
  count: z.number().optional(),
  type: z.string(),
  eventTime: z
    .string()
    .refine((date) => !isNaN(Date.parse(date)), {
      message: 'Invalid date format for "eventTime"',
    })
    .nullable(),
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
  failed: z.boolean().optional(),
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

export const CreateTokenRequestSchema = z.object({
  expires_in: z.number(),
  note: z.string(),
  roles: z.array(z.string()),
  scopes: z.array(z.string()),
});

export type CreateTokenRequest = z.infer<typeof CreateTokenRequestSchema>;

export const isCreateTokenRequest = (obj: unknown): obj is CreateTokenRequest => {
  const result = CreateTokenRequestSchema.safeParse(obj);
  if (!result.success) {
    console.error('CreateTokenRequest validation failed:', result.error);
  }
  return result.success;
};

export const TokenDetailsSchema = z.object({
  token: z.string(),
  id: z.string(),
  user: z.string(),
  service: z.string(),
  roles: z.array(z.string()),
  scopes: z.array(z.string()),
  note: z.string(),
  created: z.string().refine((date) => !isNaN(Date.parse(date)), {
    message: 'Invalid date format for "created"',
  }),
  expires_at: z.string().refine((date) => !isNaN(Date.parse(date)), {
    message: 'Invalid date format for "expires_at"',
  }),
  last_activity: z.string().refine((date) => !isNaN(Date.parse(date)), {
    message: 'Invalid date format for "last_activity"',
  }),
  session_id: z.string(),
});

export type TokenDetails = z.infer<typeof TokenDetailsSchema>;

export const isTokenDetails = (obj: unknown): obj is TokenDetails => {
  const result = TokenDetailsSchema.safeParse(obj);
  if (!result.success) {
    console.error('UserToken validation failed:', result.error);
  }
  return result.success;
};

import { z } from 'zod';

export const jupyterServerUserOptionsSchema = z.object({
  conversationId: z.string(),
});

export type JupyterServerUserOptions = z.infer<typeof jupyterServerUserOptionsSchema>;

export const isJupyterServerUserOptions = (obj: unknown): obj is JupyterServerUserOptions => {
  const result = jupyterServerUserOptionsSchema.safeParse(obj);
  if (!result.success) {
    console.error('JupyterServerUserOptions validation failed:', result.error);
  }
  return result.success;
};

export const jupyterServerStateDetailsSchema = z.object({
  pod_name: z.string(),
  namespace: z.string(),
  dns_name: z.string(),
});

export type JupyterServerStateDetails = z.infer<typeof jupyterServerStateDetailsSchema>;

export const isJupyterServerStateDetails = (obj: unknown): obj is JupyterServerStateDetails => {
  const result = jupyterServerStateDetailsSchema.safeParse(obj);
  if (!result.success) {
    console.error('JupyterServerStateDetails validation failed:', result.error);
  }
  return result.success;
};

export const jupyterServerDetailsSchema = z.object({
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
  user_options: jupyterServerUserOptionsSchema,
});

export type JupyterServerDetails = z.infer<typeof jupyterServerDetailsSchema>;

export const isJupyterServerDetails = (obj: unknown): obj is JupyterServerDetails => {
  const result = jupyterServerDetailsSchema.safeParse(obj);
  if (!result.success) {
    console.error('JupyterServerDetails validation failed:', result.error);
  }
  return result.success;
};

export const jupyterHubUserSchema = z.object({
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
  servers: z.record(jupyterServerDetailsSchema),
  auth_state: z.record(z.unknown()).nullable(),
  kind: z.string(),
  created: z.string().refine((date) => !isNaN(Date.parse(date)), {
    message: 'Invalid date format for "created"',
  }),
});

export type JupyterHubUser = z.infer<typeof jupyterHubUserSchema>;

export const isJupyterHubUser = (obj: unknown): obj is JupyterHubUser => {
  const result = jupyterHubUserSchema.safeParse(obj);
  if (!result.success) {
    console.error('JupyterHubUser validation failed:', result.error);
  }
  return result.success;
};

export const managedFieldSchema = z.object({
  manager: z.string(),
  operation: z.string(),
  apiVersion: z.string(),
  time: z.string(),
  fieldsType: z.string(),
  fieldsV1: z.record(z.object({})),
});

export type ManagedField = z.infer<typeof managedFieldSchema>;

export const isManagedField = (obj: unknown): obj is ManagedField => {
  const result = managedFieldSchema.safeParse(obj);
  if (!result.success) {
    console.error('ManagedField validation failed:', result.error);
  }
  return result.success;
};

export const metadataSchema = z.object({
  name: z.string(),
  namespace: z.string(),
  uid: z.string(),
  resourceVersion: z.string(),
  creationTimestamp: z.string().refine((date) => !isNaN(Date.parse(date)), {
    message: 'Invalid date format for "creationTimestamp"',
  }),
  managedFields: z.array(managedFieldSchema),
});

export type Metadata = z.infer<typeof metadataSchema>;

export const isMetadata = (obj: unknown): obj is Metadata => {
  const result = metadataSchema.safeParse(obj);
  if (!result.success) {
    console.error('Metadata validation failed:', result.error);
  }
  return result.success;
};

export const involvedObjectSchema = z.object({
  kind: z.string(),
  namespace: z.string(),
  name: z.string(),
  uid: z.string(),
  apiVersion: z.string(),
  resourceVersion: z.string(),
  fieldPath: z.string().optional(),
});

export type InvolvedObject = z.infer<typeof involvedObjectSchema>;

export const isInvolvedObject = (obj: unknown): obj is InvolvedObject => {
  const result = involvedObjectSchema.safeParse(obj);
  if (!result.success) {
    console.error('InvolvedObject validation failed:', result.error);
  }
  return result.success;
};

export const eventSourceSchema = z.object({
  component: z.string().optional(),
  host: z.string().optional(),
});

export type EventSource = z.infer<typeof eventSourceSchema>;

export const isEventSource = (obj: unknown): obj is EventSource => {
  const result = eventSourceSchema.safeParse(obj);
  if (!result.success) {
    console.error('EventSource validation failed:', result.error);
  }
  return result.success;
};

export const rawProgressEventSchema = z.object({
  kind: z.string().optional(),
  apiVersion: z.string().optional(),
  metadata: metadataSchema,
  involvedObject: involvedObjectSchema,
  reason: z.string(),
  message: z.string(),
  source: eventSourceSchema,
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

export type RawProgressEvent = z.infer<typeof rawProgressEventSchema>;

export const isRawProgressEvent = (obj: unknown): obj is RawProgressEvent => {
  const result = rawProgressEventSchema.safeParse(obj);
  if (!result.success) {
    console.error('RawProgressEvent validation failed:', result.error);
  }
  return result.success;
};

/**
 * An event for tracking the progress of a Jupyter server startup.
 */
export const progressEventSchema = z.object({
  progress: z.number().min(0).max(100),
  failed: z.boolean().optional(),
  raw_event: rawProgressEventSchema.optional(),
  message: z.string(),
  ready: z.boolean().optional(),
  html_message: z.string().optional(),
  url: z.string().optional(),
});

export type ProgressEvent = z.infer<typeof progressEventSchema>;

export const isProgressEvent = (obj: unknown): obj is ProgressEvent => {
  const result = progressEventSchema.safeParse(obj);
  if (!result.success) {
    console.error('ProgressEvent validation failed:', result.error);
  }
  return result.success;
};

export const createTokenRequestSchema = z.object({
  expires_in: z.number(),
  note: z.string(),
  roles: z.array(z.string()),
  scopes: z.array(z.string()),
});

export type CreateTokenRequest = z.infer<typeof createTokenRequestSchema>;

export const isCreateTokenRequest = (obj: unknown): obj is CreateTokenRequest => {
  const result = createTokenRequestSchema.safeParse(obj);
  if (!result.success) {
    console.error('CreateTokenRequest validation failed:', result.error);
  }
  return result.success;
};

export const tokenDetailsSchema = z.object({
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

export type TokenDetails = z.infer<typeof tokenDetailsSchema>;

export const isTokenDetails = (obj: unknown): obj is TokenDetails => {
  const result = tokenDetailsSchema.safeParse(obj);
  if (!result.success) {
    console.error('UserToken validation failed:', result.error);
  }
  return result.success;
};

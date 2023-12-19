import {
  StorageSharedKeyCredential,
  ContainerClient,
  generateBlobSASQueryParameters,
  BlobSASPermissions,
  BlobSASSignatureValues,
} from '@azure/storage-blob';
import { getEnvOrThrow } from './envUtils.js';

const storageCredentials = new StorageSharedKeyCredential(
  getEnvOrThrow('AZURE_STORAGE_ACCOUNT'),
  getEnvOrThrow('AZURE_STORAGE_KEY'),
);

const storageEndpointUrl = `https://${getEnvOrThrow(
  'AZURE_STORAGE_ACCOUNT',
)}.blob.core.windows.net`;

const storageContainerName = getEnvOrThrow('AZURE_STORAGE_CONTAINER');

/**
 * Generates a SAS URI for a blob associated with a specific user and conversation.
 * @param userId The ID of the user associated with the blob.
 * @param conversationId The ID of the conversation associated with the blob.
 * @param userConvBlobName The name of the blob, including any user-specific and conversation-specific segments.
 * @param expirationMins Number of minutes until the SAS token expires. Defaults to 60 minutes.
 * @param storedPolicyName Optional name of a stored access policy for the blob.
 * @returns A SAS URI for the blob.
 */
export const generateUserConvBlobSASURI = (
  userId: string,
  conversationId: string,
  userConvBlobName: string,
  expirationMins: number = 60,
  storedPolicyName?: string,
): string => {
  const containerClient = new ContainerClient(
    `${storageEndpointUrl}/${storageContainerName}`,
    storageCredentials,
  );

  const blobName = `${userId}/conversations/${conversationId}/${userConvBlobName}`;

  const sasOptions: BlobSASSignatureValues = {
    containerName: storageContainerName,
    blobName,
  };

  if (storedPolicyName === undefined) {
    sasOptions.startsOn = new Date();
    sasOptions.expiresOn = new Date();
    sasOptions.expiresOn.setMinutes(sasOptions.expiresOn.getMinutes() + expirationMins);
    sasOptions.permissions = BlobSASPermissions.parse('r');
  } else {
    sasOptions.identifier = storedPolicyName;
  }

  return `${containerClient.getBlobClient(blobName).url}?${generateBlobSASQueryParameters(
    sasOptions,
    storageCredentials,
  ).toString()}`;
};

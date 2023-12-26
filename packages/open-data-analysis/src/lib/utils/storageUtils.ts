import { Readable } from 'node:stream';
import {
  StorageSharedKeyCredential,
  ContainerClient,
  generateBlobSASQueryParameters,
  BlobSASPermissions,
  BlobSASSignatureValues,
} from '@azure/storage-blob';

import { getEnvOrThrow } from './envUtils.js';
import { UploadProgressCb } from './storageTypes.js';
import { TransferProgressEvent } from '@azure/core-http';

const _storageCredentials = new StorageSharedKeyCredential(
  getEnvOrThrow('AZURE_STORAGE_ACCOUNT'),
  getEnvOrThrow('AZURE_STORAGE_KEY'),
);

const _storageEndpointUrl = `https://${getEnvOrThrow(
  'AZURE_STORAGE_ACCOUNT',
)}.blob.core.windows.net`;

const _storageContainerName = getEnvOrThrow('AZURE_STORAGE_CONTAINER');

const _mountPath = getEnvOrThrow('AZURE_STORAGE_MOUNT_PATH');

export const mountPath = _mountPath.endsWith('/') ? _mountPath.slice(0, -1) : _mountPath;

const getContainerUrl = (containerName: string): string =>
  `${_storageEndpointUrl}/${_storageContainerName}`;

/**
 * Generates a blob name based on user ID and conversation ID.
 * @param userId The ID of the user.
 * @param conversationId The ID of the conversation.
 * @param fileName The name of the file.
 * @returns The generated blob name.
 */
const generateBlobName = (userId: string, conversationId: string, fileName: string): string =>
  `${userId}/conversations/${conversationId}/${fileName}`;

/**
 * Uploads a file to Azure Blob Storage within a specific user and conversation context.
 * @param userId The ID of the user associated with the blob.
 * @param conversationId The ID of the conversation associated with the blob.
 * @param userConvBlobName The name of the blob, including any user-specific and conversation-specific segments.
 * @param fileBuffer The buffer containing the file data to upload.
 * @returns Promise resolving to the URL of the uploaded blob.
 */
export const uploadToUserConvBlob = async (
  userId: string,
  conversationId: string,
  userConvBlobName: string,
  fileStream: Readable,
  fileSizeBytes?: number,
  onProgress?: UploadProgressCb,
): Promise<string> => {
  const containerClient = new ContainerClient(
    getContainerUrl(_storageContainerName),
    _storageCredentials,
  );

  const blobName = generateBlobName(userId, conversationId, userConvBlobName);
  const blockBlobClient = containerClient.getBlockBlobClient(blobName);
  if (onProgress !== undefined && fileSizeBytes !== undefined) {
    await blockBlobClient.uploadStream(fileStream, undefined, undefined, {
      onProgress: (progress: TransferProgressEvent) =>
        onProgress(progress.loadedBytes, fileSizeBytes),
    });
  } else {
    await blockBlobClient.uploadStream(fileStream);
  }

  return blockBlobClient.url;
};

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
    getContainerUrl(_storageContainerName),
    _storageCredentials,
  );

  const blobName = generateBlobName(userId, conversationId, userConvBlobName);

  const sasOptions: BlobSASSignatureValues = {
    containerName: _storageContainerName,
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
    _storageCredentials,
  ).toString()}`;
};

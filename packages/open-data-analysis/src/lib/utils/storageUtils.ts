import {
  StorageSharedKeyCredential,
  generateFileSASQueryParameters,
  FileSASPermissions,
} from '@azure/storage-file-share';
import { getEnvOrThrow } from './envUtils.js';

const StorageCreds = new StorageSharedKeyCredential(
  getEnvOrThrow('AZURE_STORAGE_ACCOUNT'),
  getEnvOrThrow('AZURE_STORAGE_KEY'),
);

const StorageEndpoint = `https://${getEnvOrThrow('AZURE_STORAGE_ACCOUNT')}.file.core.windows.net`;

const ShareName = getEnvOrThrow('AZURE_STORAGE_FILESHARE');

const MountPath = getEnvOrThrow('AZURE_STORAGE_MOUNT_PATH');

export const generateSASURL = (
  userId: string,
  conversationId: string,
  mntFilePath: string,
  expirationMins: number,
): string => {
  const shareFilePath = `/users/${userId}/conversations/${conversationId}/${mntFilePath.replace(
    MountPath.endsWith('/') ? MountPath : MountPath + '/',
    '',
  )}`;
  const expiresOn = new Date();
  expiresOn.setMinutes(expiresOn.getMinutes() + expirationMins);

  const sasToken = generateFileSASQueryParameters(
    {
      version: '2022-11-02',
      expiresOn,
      permissions: FileSASPermissions.parse('r'),
      shareName: ShareName,
      filePath: shareFilePath,
    },
    StorageCreds,
  ).toString();

  return `${StorageEndpoint}/${ShareName}/${shareFilePath}?${sasToken}`;
};

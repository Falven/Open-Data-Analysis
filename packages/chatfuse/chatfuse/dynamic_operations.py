#!/usr/bin/env python
from __future__ import print_function, absolute_import, division
import logging
import os
import errno
from threading import Lock
from datetime import datetime
from typing import Any, Callable, Dict, List, Optional
from fuse import FuseOSError, Operations, LoggingMixIn

logger = logging.getLogger(__name__)


class DynamicOperations(LoggingMixIn, Operations):
    """
    A Dynamic Loopback FUSE filesystem that supports a configurable subpath and file filtering.
    This filesystem operates on local files and directories, providing dynamic visibility
    based on the specified subpath.
    """

    def __init__(
        self,
        root: str,
        subpath: str = "",
        is_path_hidden: Optional[Callable[[str], bool]] = lambda path: False,
        prevent_hiding_mount_path: bool = True,
        prevent_hidden_path_conflicts: bool = False,
    ) -> None:
        """
        Initialize the Dynamic FUSE file system.

        :param root: The root directory for the local filesystem operations.
        :param subpath: The initial subpath within the root to expose through the filesystem.
        :param is_path_hidden: A callback function to determine the visibility of paths based on certain criteria.
        :param prevent_hiding_mount_path: If True, prevents the root and subpath from being hidden.
        :param prevent_hidden_path_conflicts: If True, prevents conflicts with hidden paths
               when creating a new file or directory by renaming the existing path.
        """
        if not os.path.isdir(root):
            os.makedirs(root, exist_ok=True)
        self.root = os.path.realpath(root)
        self.rwlock = Lock()
        self.subpath = subpath
        self.is_path_hidden = is_path_hidden
        self.prevent_hiding_root_path = prevent_hiding_mount_path
        self.prevent_hidden_path_conflicts = prevent_hidden_path_conflicts

    def __call__(self, op: str, path: str, *args: Any) -> Any:
        """
        Overrides the call method to handle file operations. This method normalizes
        the path to the configured subpath within the local filesystem before invoking
        the appropriate operation.

        :param op: The file operation to be performed.
        :param path: The path where the operation is to be performed, relative to the configured subpath.
        :param args: Additional arguments for the file operation.
        :return: The result of the file operation.
        """
        return super(DynamicOperations, self).__call__(
            op,
            self._to_absolute_path(path),
            *args,
        )

    @property
    def subpath(self) -> str:
        """Getter for the subpath property."""
        return self._subpath

    @subpath.setter
    def subpath(self, value) -> None:
        """
        Setter for the subpath property.
        """
        new_subpath = os.path.normpath(value)
        if not hasattr(self, "_subpath") or self._subpath != new_subpath:
            self._subpath = new_subpath
            self.last_subpath_update = datetime.now()
            os.makedirs(self.mountpath, exist_ok=True)

    @property
    def mountpath(self) -> str:
        """
        Returns the mount path for the filesystem.
        """
        return os.path.join(self.root, self.subpath)

    def _to_absolute_path(self, path: str) -> str:
        """
        Converts a path relative to the configured subpath to an absolute path in the local filesystem.

        :param path: The path relative to the configured subpath.
        :return: The absolute path in the local filesystem.
        """
        return os.path.normpath(os.path.join(self.mountpath, path.lstrip("/")))

    def _enforce_path_hiding(self, path: str, log: str = None) -> None:
        """
        Determines if a file should be filtered out based on the configured filter function.

        :param path: The path to the file.
        :raises FuseOSError: If the file should be filtered out.
        """
        if not (
            self.prevent_hiding_root_path and path == os.path.normpath(self.mountpath)
        ) and self.is_path_hidden(path):
            logger.info(
                f"-> _is_file_hidden {log}" if log else f"-> _is_file_hidden {path}"
            )
            raise FuseOSError(errno.ENOENT)

    def _generate_unique_name(self, path: str) -> str:
        """
        Generate a unique name for a file or directory to avoid conflicts.
        Appends a timestamp to the path. Handles paths with or without file extensions.
        """
        directory, name = os.path.split(path)
        base, ext = os.path.splitext(name)
        timestamp = datetime.now().strftime("%Y%m%d%H%M%S")
        new_name = f"{base}_{timestamp}"
        if ext:
            new_name += ext
        return os.path.join(directory, new_name)

    def _handle_hidden_path_conflict(self, path: str) -> None:
        """
        Handle potential conflicts with hidden paths (files or directories) when creating a new file or directory.
        If a hidden file or directory exists at the given path, it is renamed to avoid conflict.

        :param path: The path where the new file or directory is to be created.
        """
        if (
            self.prevent_hidden_path_conflicts
            and os.path.exists(path)
            and self.is_path_hidden(path)
        ):
            try:
                unique_path = self._generate_unique_name(path)
                logger.info(
                    f"Renaming existing hidden path '{path}' to '{unique_path}' to avoid conflict."
                )
                os.rename(path, unique_path)
            except OSError as e:
                if e.errno != errno.ENOENT:
                    raise

    def access(self, path: str, mode: int) -> None:
        """
        Checks if the user has access to the file or directory at the given path.

        :param path: The path to the file or directory in the local filesystem.
        :param mode: The access mode to be checked (e.g., read, write, etc.).
        :raises FuseOSError: If the file doesn't exist or isn't accessible.
        """
        self._enforce_path_hiding(path, f"Attempt to access hidden file: {path}")
        if not os.access(path, mode):
            raise FuseOSError(errno.EACCES)

    def chmod(self, path: str, mode: int) -> None:
        """
        Change the mode (permissions) of a file or directory.

        This method is a direct mapping to the os.chmod function, affecting the local filesystem.
        """
        self._enforce_path_hiding(
            path, f"Attempt to change mode of hidden file: {path}"
        )
        os.chmod(path, mode)

    def chown(self, path: str, uid: int, gid: int) -> None:
        """
        Change the owner and group of a file or directory.

        This method is a direct mapping to the os.chown function, affecting the local filesystem.
        """
        self._enforce_path_hiding(
            path, f"Attempt to change ownership of hidden file: {path}"
        )
        os.chown(path, uid, gid)

    def create(self, path: str, mode: int) -> int:
        """
        Create a new file with the given mode.

        :param path: The path to the new file in the local filesystem.
        :param mode: The file access mode (e.g., read, write).
        :return: A file descriptor that can be used for subsequent operations.
        """
        self._handle_hidden_path_conflict(path)
        return os.open(path, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, mode)

    def flush(self, path: str, fh: int) -> None:
        """
        Flush cached data of a file to the disk.

        :param path: The path to the file.
        :param fh: The file handle.
        """
        return os.fsync(fh)

    def fsync(self, path: str, datasync: int, fh: int) -> None:
        """
        Synchronize the file's in-memory state with the storage device.

        :param path: The path to the file.
        :param datasync: If non-zero, only the file's data is synchronized. If zero, both data and metadata are synchronized.
        :param fh: The file handle.
        """
        return os.fdatasync(fh) if datasync != 0 else os.fsync(fh)

    def getattr(self, path: str, fh: Optional[int] = None) -> Dict[str, Any]:
        """
        Gets the attributes of a file or directory in the local filesystem.

        :param path: The path to the file or directory.
        :param fh: The file handle, not used in this method.
        :return: A dictionary with file attributes.
        :raises FuseOSError: If the file does not exist or cannot be accessed.
        """
        self._enforce_path_hiding(
            path, f"Attempt to get attributes for hidden file: {path}"
        )
        st = os.lstat(path)
        return dict(
            (key, getattr(st, key))
            for key in (
                "st_atime",
                "st_ctime",
                "st_gid",
                "st_mode",
                "st_mtime",
                "st_nlink",
                "st_size",
                "st_uid",
            )
        )

    getxattr = None

    def link(self, target: str, source: str) -> None:
        """
        Create a hard link to a file.

        :param target: The path where the new hard link will be created.
        :param source: The path of the file to which the hard link will refer.
        """
        abs_source = self._to_absolute_path(source)
        self._enforce_path_hiding(abs_source)
        return os.link(abs_source, target)

    listxattr = None
    """
    Not implemented. Extended attributes are not supported in this filesystem.
    """

    def mkdir(self, path: str, mode: int) -> None:
        """
        Create a new directory.

        This method is a direct mapping to the os.mkdir function, affecting the local filesystem.
        """
        self._handle_hidden_path_conflict(path)
        os.mkdir(path, mode)

    def mknod(self, path: str, mode: int, dev: int) -> None:
        """
        Create a filesystem node (file, device special file, or named pipe).

        This method is a direct mapping to the os.mknod function, affecting the local filesystem.
        Handles conflicts with hidden paths.

        :param path: The path where the node is to be created.
        :param mode: The node mode (type and permissions).
        :param dev: Device specification (required for device files).
        """
        self._handle_hidden_path_conflict(path)
        os.mknod(path, mode, dev)

    def open(self, path: str, flags: int) -> int:
        """
        Open a file and return a file descriptor.

        :param path: The path to the file in the local filesystem.
        :param flags: Flags that determine the method of opening the file.
        :return: A file descriptor that can be used for subsequent operations.
        :raises FuseOSError: If the file is hidden or cannot be accessed.
        """
        self._enforce_path_hiding(path, f"Attempt to open a hidden file: {path}")
        return os.open(path, flags)

    def read(self, path: str, size: int, offset: int, fh: int) -> bytes:
        """
        Read data from a file in the local filesystem.

        :param path: The path to the file. This parameter is not used in this method but
                     is part of the standard FUSE 'read' method signature.
        :param size: The number of bytes to read.
        :param offset: The offset in the file from where to start reading.
        :param fh: The file handle obtained from the 'open' or 'create' methods.
        :return: The bytes read from the file.
        """
        self._enforce_path_hiding(path, f"Attempt to read a hidden file: {path}")
        with self.rwlock:
            os.lseek(fh, offset, 0)
            return os.read(fh, size)

    def readdir(self, path: str, fh: int) -> List[str]:
        """
        Reads the directory contents.

        :param path: The path to the directory.
        :param fh: The file handle.
        :return: A list of file and directory names within the specified directory.
        """
        paths = os.listdir(path)
        visible_paths = [
            name
            for name in paths
            if not self.is_path_hidden(self._to_absolute_path(name))
        ]
        return [".", ".."] + visible_paths

    def readlink(self, path: str) -> str:
        """
        Return a string representing the path to which the symbolic link points.

        :param path: The path to the symbolic link in the local filesystem.
        :return: The path to which the symbolic link points.
        :raises FuseOSError: If the symbolic link is hidden or cannot be accessed.
        """
        self._enforce_path_hiding(
            path, f"Attempt to read a hidden symbolic link: {path}"
        )
        return os.readlink(path)

    def release(self, path: str, fh: int) -> None:
        """
        Close an open file.

        :param path: The path to the file.
        :param fh: The file handle.
        """
        os.close(fh)

    def rename(self, old_path: str, new_path: str) -> None:
        """
        Rename a file or directory.

        :param old_path: The current path of the file or directory.
        :param new_path: The new path for the file or directory.
        """
        self._enforce_path_hiding(
            old_path, f"Attempt to rename a hidden file: {old_path} {new_path}"
        )
        abs_new_path = self._to_absolute_path(new_path)
        return os.rename(old_path, abs_new_path)

    def rmdir(self, path: str) -> None:
        """
        Remove a directory.

        This method is a direct mapping to the os.rmdir function, affecting the local filesystem.
        """
        self._enforce_path_hiding(path, f"Attempt to remove a hidden directory: {path}")
        os.rmdir(path)

    def statfs(self, path: str) -> Dict[str, int]:
        """
        Retrieve filesystem statistics.

        :param path: The path for which to retrieve statistics.
        :return: A dictionary containing filesystem statistics.
        """
        self._enforce_path_hiding(path, f"Attempt to get stats for hidden file: {path}")
        stv = os.statvfs(path)
        return dict(
            (key, getattr(stv, key))
            for key in (
                "f_bavail",
                "f_bfree",
                "f_blocks",
                "f_bsize",
                "f_favail",
                "f_ffree",
                "f_files",
                "f_flag",
                "f_frsize",
                "f_namemax",
            )
        )

    def symlink(self, target: str, source: str) -> None:
        """
        Create a symbolic link named 'target' pointing to 'source'.

        :param target: The pathname for the symbolic link to be created.
        :param source: The pathname that the new symbolic link points to.
        """
        abs_source = self._to_absolute_path(source)
        self._enforce_path_hiding(
            abs_source,
            f"Attempt to create a hidden symbolic link: {abs_source} {target}",
        )
        return os.symlink(abs_source, target)

    def truncate(self, path: str, length: int) -> None:
        """
        Truncate a file to a specified length.

        :param path: The path to the file.
        :param length: The length to truncate to.
        """
        self._enforce_path_hiding(path, f"Attempt to truncate a hidden file: {path}")
        with open(path, "r+") as f:
            f.truncate(length)

    def unlink(self, path: str) -> None:
        """
        Remove a file.

        This method is a direct mapping to the os.unlink function, affecting the local filesystem.
        """
        self._enforce_path_hiding(path, f"Attempt to remove a hidden file: {path}")
        os.unlink(path)

    def utimens(
        self, path: str, times: tuple[int, int] | tuple[float, float] | None = None
    ) -> None:
        """
        Change file last access and modification times.

        This method is a direct mapping to the os.utime function, affecting the local filesystem.
        """
        self._enforce_path_hiding(
            path, f"Attempt to change times for hidden file: {path}"
        )
        os.utime(path, times)

    def write(self, path: str, data: bytes, offset: int, fh: int) -> int:
        """
        Writes data to a file in the local filesystem.

        :param path: The path to the file.
        :param data: The data to be written.
        :param offset: The offset at which to start writing data.
        :param fh: The file handle.
        :return: The number of bytes written.
        """
        self._enforce_path_hiding(path, f"Attempt to write to a hidden file: {path}")
        with self.rwlock:
            os.lseek(fh, offset, 0)
            return os.write(fh, data)
